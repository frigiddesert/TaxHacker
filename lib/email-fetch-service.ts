import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { mkdir, writeFile } from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';
import { createFile } from '@/models/files';
import { getCurrentUser } from './auth';
import { getUserUploadsDirectory, safePathJoin, unsortedFilePath } from './files';
import config from './config';
import { prisma } from './db';
import crypto from 'crypto';
import { getVendors } from '@/models/vendors';
import { getSettings } from '@/models/settings';
import { requestLLM } from '@/ai/providers/llmProvider';
import { getLLMSettings } from '@/models/settings';

export interface EmailFetchResult {
  totalFetched: number;
  processed: number;
  failed: number;
  skipped: number;
  errors: string[];
  details: Array<{
    uid: number;
    messageId: string;
    from: string;
    subject: string;
    status: 'processed' | 'skipped' | 'failed';
    reason?: string;
  }>;
}

export class EmailFetchService {
  private client: ImapFlow | null = null;

  constructor() {}

  async fetchEmailsFromLastDays(days: number = 7, force: boolean = false): Promise<EmailFetchResult> {
    const result: EmailFetchResult = {
      totalFetched: 0,
      processed: 0,
      failed: 0,
      skipped: 0,
      errors: [],
      details: []
    };

    try {
      // Connect to IMAP server
      this.client = new ImapFlow({
        host: config.emailIngestion.host,
        port: config.emailIngestion.port,
        secure: config.emailIngestion.secure,
        auth: {
          user: config.emailIngestion.user,
          pass: config.emailIngestion.password
        }
      });

      await this.client.connect();
      console.log('Connected to IMAP server for email fetch');

      // Select mailbox
      const lock = await this.client.getMailboxLock(config.emailIngestion.mailbox);
      
      try {
        const user = await getCurrentUser();
        if (!user) {
          throw new Error('User not authenticated');
        }

        // Search for all messages (date-based search doesn't work reliably with this IMAP server)
        console.log(`Searching for all emails in mailbox...`);

        // Skip date-based search entirely and get all messages
        const rawUids = await this.client.search({}, { uid: true }) as any;
        const messageUids: number[] = Array.isArray(rawUids) ? rawUids : [];
        console.log(`Found ${messageUids.length} total emails in mailbox`);

        result.totalFetched = messageUids.length;

        if (messageUids.length === 0) {
          return result;
        }

        // Get mailbox info for UID validity
        const mb: any = (this.client as any).mailbox;
        const uidValidity = BigInt(mb.uidValidity ?? 0);

        // Fetch email details
        const messages = await this.client.fetch(messageUids as any, {
          uid: true,
          envelope: true,
          source: true,
          internalDate: true
        });

        // Calculate date range for filtering
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);

        for await (const message of messages) {
          // Filter by date if not forcing processing
          if (!force && message.internalDate) {
            const messageDate = new Date(message.internalDate);
            if (messageDate < startDate || messageDate > endDate) {
              console.log(`Skipping email ${message.uid} - outside date range (${messageDate.toISOString()})`);
              continue;
            }
          }
          const uid = message.uid;
          const messageId = message.envelope?.messageId || `no-id-${uid}`;
          const from = message.envelope?.from?.[0]?.address || 'unknown';
          const subject = message.envelope?.subject || '(no subject)';

          try {
            // Check if we already have this email (unless force is true)
            if (!force) {
              const existingLog = await prisma.emailIngestionLog.findUnique({
                where: {
                  userId_mailbox_uidValidity_uid: {
                    userId: user.id,
                    mailbox: config.emailIngestion.mailbox,
                    uidValidity,
                    uid
                  }
                }
              });

              if (existingLog) {
                result.skipped++;
                result.details.push({
                  uid,
                  messageId,
                  from,
                  subject,
                  status: 'skipped',
                  reason: `Already processed (status: ${existingLog.status})`
                });
                console.log(`Skipping email ${uid} - already processed`);
                continue;
              }
            }

            // Create initial log entry with 'pending' status
            await prisma.emailIngestionLog.create({
              data: {
                userId: user.id,
                mailbox: config.emailIngestion.mailbox,
                uidValidity,
                uid,
                messageId,
                internalDate: message.internalDate || message.envelope?.date || new Date(),
                from,
                subject,
                status: 'pending',
                attachmentHashes: []
              }
            });

            // Process the email
            if (!message.source) {
              throw new Error('Empty message source');
            }

            const attachmentHashes = await this.processEmail(
              message.source as Buffer,
              message.envelope,
              user,
              uid,
              config.emailIngestion.mailbox,
              uidValidity
            );

            // Update log with success
            await prisma.emailIngestionLog.update({
              where: {
                userId_mailbox_uidValidity_uid: {
                  userId: user.id,
                  mailbox: config.emailIngestion.mailbox,
                  uidValidity,
                  uid
                }
              },
              data: {
                status: 'processed',
                attachmentHashes: attachmentHashes || []
              }
            });

            result.processed++;
            result.details.push({
              uid,
              messageId,
              from,
              subject,
              status: 'processed'
            });

            console.log(`Processed email ${uid}: ${subject} from ${from}`);

          } catch (error: any) {
            result.failed++;
            const errorMsg = error?.message || String(error);
            result.errors.push(`Email ${uid}: ${errorMsg}`);
            
            result.details.push({
              uid,
              messageId,
              from,
              subject,
              status: 'failed',
              reason: errorMsg
            });

            // Update log with error
            try {
              await prisma.emailIngestionLog.update({
                where: {
                  userId_mailbox_uidValidity_uid: {
                    userId: user.id,
                    mailbox: config.emailIngestion.mailbox,
                    uidValidity,
                    uid
                  }
                },
                data: {
                  status: 'error',
                  error: errorMsg
                }
              });
            } catch (updateError) {
              console.error('Failed to update error status in log:', updateError);
            }

            console.error(`Failed to process email ${uid}:`, error);
          }
        }

      } finally {
        lock.release();
      }

    } catch (error: any) {
      const errorMsg = error?.message || String(error);
      result.errors.push(`Connection/Setup error: ${errorMsg}`);
      console.error('Error during email fetch:', error);
    } finally {
      // Cleanup connection
      if (this.client) {
        try {
          await this.client.logout();
        } catch (e) {
          console.error('Error closing IMAP connection:', e);
        }
        this.client = null;
      }
    }

    return result;
  }

  private async processEmail(
    emailSource: Buffer,
    envelope: any,
    user: { id: string; email: string },
    uid: number,
    mailbox: string,
    uidValidity: bigint
  ): Promise<string[] | null> {
    try {
      const parsed = await simpleParser(emailSource);

      // Simplified processing - just save all emails for now
      console.log('[Email] Processing email with simplified flow');
      
      const hashes: string[] = [];

      // Process PDF attachments if they exist
      const pdfAttachments = parsed.attachments?.filter((att: any) => 
        att.contentType === 'application/pdf'
      ) || [];

      if (pdfAttachments.length > 0) {
        console.log(`[Email] Found ${pdfAttachments.length} PDF attachments, saving them`);
        for (const attachment of pdfAttachments) {
          try {
            await this.processPdfAttachment(attachment, user, envelope, uid, mailbox, uidValidity);
            const hash = crypto.createHash('sha256').update(attachment.content).digest('hex');
            hashes.push(hash);
          } catch (pdfError) {
            console.error('[Email] PDF processing error:', pdfError);
            // Continue processing other attachments
          }
        }
      }

      // Always save email content for review
      await this.saveEmailContent(parsed, user, envelope, uid, mailbox, uidValidity);
      hashes.push('email-content');

      return hashes;

    } catch (error) {
      console.error('Error parsing email:', error);
    }
    return null;
  }

  private isInvoiceHeuristic(parsed: any): boolean {
    const subject = parsed.subject?.toLowerCase() || '';
    const body = parsed.text?.toLowerCase() || '';
    const html = parsed.html?.toLowerCase() || '';

    const invoiceKeywords = [
      'invoice', 'bill', 'payment', 'receipt', 'statement',
      'due', 'amount', 'total', 'tax', 'vendor', 'supplier',
      'purchase order', 'po number', 'account', 'balance'
    ];

    const hasInvoiceKeyword = invoiceKeywords.some(keyword => 
      subject.includes(keyword) || body.includes(keyword) || html.includes(keyword)
    );

    return hasInvoiceKeyword;
  }

  private hasPdfAttachment(parsed: any): boolean {
    return parsed.attachments?.some((att: any) => att.contentType === 'application/pdf') || false;
  }

  private async matchKnownVendor(userId: string, parsed: any) {
    try {
      const vendors = await getVendors(userId);
      const fromAddrs: string[] = [];
      const from = parsed.from?.value || [];
      for (const a of from) {
        if (a.address) fromAddrs.push(a.address.toLowerCase());
      }
      const domains = fromAddrs.map((a) => a.split('@')[1]);
      const subj = (parsed.subject || '').toLowerCase();

      for (const v of vendors) {
        if (v.isActive === false) continue;
        const emails: string[] = Array.isArray((v as any).fromEmails) ? (v as any).fromEmails : [];
        const doms: string[] = Array.isArray((v as any).fromDomains) ? (v as any).fromDomains : [];
        const keys: string[] = Array.isArray((v as any).subjectKeywords) ? (v as any).subjectKeywords : [];

        if (emails.some((e) => fromAddrs.includes(e.toLowerCase()))) return v;
        if (doms.some((d) => domains.includes(d.toLowerCase()))) return v;
        if (keys.some((k) => subj.includes(k.toLowerCase()))) return v;
      }
    } catch (e) {
      console.warn('[Email] Vendor match failed', e);
    }
    return null;
  }

  private async classifyWithLLM(userId: string, parsed: any): Promise<boolean> {
    try {
      const settings = await getSettings(userId);
      const llmSettings = getLLMSettings(settings);
      const fromAddr = parsed.from?.text || '';
      const toAddr = parsed.to?.text || '';
      const subject = parsed.subject || '';
      let bodySnippet = '';
      // Only include small snippet if empty subject or unclear
      if (!subject || subject.length < 8) {
        const text = parsed.text || '';
        bodySnippet = text.substring(0, 240);
      }
      const prompt = `You classify if an email is likely a real bill/invoice we should ingest. 
Fields:
- from: ${fromAddr}
- to: ${toAddr}
- subject: ${subject}
- snippet: ${bodySnippet}

Answer JSON with is_invoice (boolean) and confidence (0-1). Be conservative.`;

      const schema = {
        type: 'object',
        properties: {
          is_invoice: { type: 'boolean' },
          confidence: { type: 'number' },
        },
        required: ['is_invoice', 'confidence'],
        additionalProperties: false,
      } as any;

      const res = await requestLLM(llmSettings, { prompt, schema });
      if (res.error) return false;
      const out: any = res.output;
      const isInvoice = Boolean(out.is_invoice);
      const conf = Number(out.confidence || 0);
      return isInvoice && conf >= 0.6;
    } catch (e) {
      console.warn('[Email] LLM classify failed', e);
      return false;
    }
  }

  private async processInvoiceEmail(parsed: any, envelope: any, user: { id: string; email: string }, uid: number, mailbox: string, uidValidity: bigint): Promise<string[] | null> {
    try {
      // Process PDF attachments
      const pdfAttachments = parsed.attachments?.filter((att: any) => 
        att.contentType === 'application/pdf'
      ) || [];

      const hashes: string[] = [];
      for (const attachment of pdfAttachments) {
        const hash = crypto.createHash('sha256').update(attachment.content).digest('hex');
        hashes.push(hash);
        await this.processPdfAttachment(attachment, user, envelope, uid, mailbox, uidValidity);
      }

      // Also save the email body as a text file for analysis
      if (parsed.text || parsed.html) {
        await this.saveEmailContent(parsed, user, envelope, uid, mailbox, uidValidity);
        hashes.push('email-content');
      }
      
      return hashes;
    } catch (error) {
      console.error('Error processing invoice email:', error);
      return null;
    }
  }

  private async processPdfAttachment(
    attachment: any,
    user: { id: string; email: string },
    envelope: any,
    uid: number,
    mailbox: string,
    uidValidity: bigint
  ): Promise<void> {
    const fileUuid = randomUUID();
    const filename = attachment.filename || `invoice_${Date.now()}.pdf`;
    const relativeFilePath = unsortedFilePath(fileUuid, filename);
    const userUploadsDirectory = getUserUploadsDirectory(user as any);
    const fullFilePath = safePathJoin(userUploadsDirectory, relativeFilePath);

    // Create directory if it doesn't exist
    await mkdir(path.dirname(fullFilePath), { recursive: true });

    // Save PDF file
    await writeFile(fullFilePath, attachment.content);

    // Create file record in database
    await createFile(user.id, {
      id: fileUuid,
      filename,
      path: relativeFilePath,
      mimetype: 'application/pdf',
      metadata: {
        source: 'email',
        from: envelope.from?.[0]?.address,
        subject: envelope.subject,
        receivedDate: new Date().toISOString(),
        size: attachment.content.length,
        attachmentHash: crypto.createHash('sha256').update(attachment.content).digest('hex'),
        emailUid: uid,
        emailUidValidity: uidValidity.toString(),
        emailMailbox: mailbox,
        messageId: envelope.messageId || null
      }
    });

    console.log(`Saved PDF attachment: ${filename} to ${fullFilePath}`);
  }

  private async saveEmailContent(
    parsed: any,
    user: { id: string; email: string },
    envelope: any,
    uid: number,
    mailbox: string,
    uidValidity: bigint
  ): Promise<void> {
    const fileUuid = randomUUID();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const fromEmail = envelope.from?.[0]?.address?.split('@')[0] || 'unknown';
    const filename = `email_${fromEmail}_${timestamp}.txt`;
    const relativeFilePath = unsortedFilePath(fileUuid, filename);
    const userUploadsDirectory = getUserUploadsDirectory(user as any);
    const fullFilePath = safePathJoin(userUploadsDirectory, relativeFilePath);

    // Create directory if it doesn't exist
    await mkdir(path.dirname(fullFilePath), { recursive: true });

    // Save email content as text
    const emailContent = `From: ${envelope.from?.[0]?.address || 'Unknown'}
To: ${envelope.to?.[0]?.address || 'Unknown'}
Subject: ${envelope.subject || '(no subject)'}
Date: ${envelope.date?.toISOString() || new Date().toISOString()}
Message-ID: ${envelope.messageId || 'unknown'}

--- Email Content ---

${parsed.text || parsed.html || '(no content)'}`;

    await writeFile(fullFilePath, emailContent);

    // Create file record in database
    await createFile(user.id, {
      id: fileUuid,
      filename,
      path: relativeFilePath,
      mimetype: 'text/plain',
      metadata: {
        source: 'email',
        from: envelope.from?.[0]?.address,
        subject: envelope.subject,
        receivedDate: new Date().toISOString(),
        size: emailContent.length,
        contentHash: crypto.createHash('sha256').update(emailContent).digest('hex'),
        emailUid: uid,
        emailUidValidity: uidValidity.toString(),
        emailMailbox: mailbox,
        messageId: envelope.messageId || null
      }
    });

    console.log(`Saved email content: ${filename}`);
  }
}
