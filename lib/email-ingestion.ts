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

export interface EmailIngestionConfig {
  host: string;
  port: number;
  secure: boolean;
  auth: {
    user: string;
    pass: string;
  };
  mailbox: string;
  pollingInterval: number; // in milliseconds
}

export class EmailIngestionService {
  private client: ImapFlow | null = null;
  private pollingInterval: NodeJS.Timeout | null = null;
  private config: EmailIngestionConfig;

  constructor(config: EmailIngestionConfig) {
    this.config = config;
  }

  async start(): Promise<void> {
    try {
      this.client = new ImapFlow(this.config);
      await this.client.connect();
      console.log('Email ingestion service connected');

      // Start polling immediately and then on schedule
      await this.pollEmails();
      this.pollingInterval = setInterval(() => this.pollEmails(), this.config.pollingInterval);
    } catch (error) {
      console.error('Failed to start email ingestion service:', error);
      throw error;
    }
  }

  async stop(): Promise<void> {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }

    if (this.client) {
      await this.client.logout();
      this.client = null;
    }
  }

  private async pollEmails(): Promise<void> {
    if (!this.client) return;

    try {
      const lock = await this.client.getMailboxLock(this.config.mailbox);
      try {
        const mb: any = (this.client as any).mailbox;
        if (!mb) {
          return;
        }
        const uidValidity = BigInt(mb.uidValidity ?? 0);
        const uidNext = mb.uidNext || 1;

        const user = await getCurrentUser();
        const last = await prisma.emailIngestionLog.aggregate({
          _max: { uid: true },
          where: { userId: user.id, mailbox: this.config.mailbox, uidValidity },
        });
        const lastUid = last._max.uid ?? 0;
        const startUid = lastUid + 1;
        const endUid = Math.max(startUid, uidNext - 1);
        if (endUid < startUid) return;

        const range = `${startUid}:${endUid}`;
        const messages = await this.client.fetch(range, { uid: true, envelope: true, source: true });

        for await (const message of messages) {
          const uid: number = message.uid;
          // Try to insert log; if exists, skip
          try {
            await prisma.emailIngestionLog.create({
              data: {
                userId: user.id,
                mailbox: this.config.mailbox,
                uidValidity,
                uid,
                messageId: message.envelope?.messageId || null,
                internalDate: message.envelope?.date || null,
                from: message.envelope?.from?.map((a: any) => a.address || a.name).join(', '),
                subject: message.envelope?.subject || '',
                status: 'pending',
              },
            });
          } catch (e: any) {
            // Unique violation -> already processed or in-progress
            continue;
          }

          try {
            if (!message.source) {
              throw new Error('Empty message source')
            }
            const attachmentHashes = await this.processEmail(message.source as Buffer, message.envelope);
            await prisma.emailIngestionLog.update({
              where: {
                userId_mailbox_uidValidity_uid: {
                  userId: user.id,
                  mailbox: this.config.mailbox,
                  uidValidity,
                  uid,
                },
              },
              data: { status: 'processed', attachmentHashes: attachmentHashes || [] },
            });
          } catch (error: any) {
            console.error('Failed to process email:', error);
            await prisma.emailIngestionLog.update({
              where: {
                userId_mailbox_uidValidity_uid: {
                  userId: user.id,
                  mailbox: this.config.mailbox,
                  uidValidity,
                  uid,
                },
              },
              data: { status: 'error', error: String(error?.message || error) },
            });
          }
        }
      } finally {
        lock.release();
      }
    } catch (error) {
      console.error('Error polling emails:', error);
    }
  }

  private async processEmail(emailSource: Buffer, envelope: any): Promise<string[] | null> {
    try {
      const parsed = await simpleParser(emailSource);
      const user = await getCurrentUser();

      // Step 1: Known vendor match (domains/emails/subject)
      const matchedVendor = await this.matchKnownVendor(user.id, parsed);
      if (matchedVendor) {
        const hasPdf = this.hasPdfAttachment(parsed)
        if (hasPdf) {
          console.log('[Email] Known vendor matched, ingesting attachments:', matchedVendor.name)
          return await this.processInvoiceEmail(parsed, envelope);
        }
      }

      // Step 2: Lightweight heuristic
      if (this.isInvoiceHeuristic(parsed)) {
        if (this.hasPdfAttachment(parsed)) {
          console.log('[Email] Heuristic matched with PDF, ingesting')
          return await this.processInvoiceEmail(parsed, envelope)
        }
      }

      // Step 3: LLM classification (subject/from/to; fallback to short body)
      const shouldIngest = await this.classifyWithLLM(user.id, parsed)
      if (shouldIngest && this.hasPdfAttachment(parsed)) {
        console.log('[Email] LLM classified as invoice, ingesting')
        return await this.processInvoiceEmail(parsed, envelope)
      }
    } catch (error) {
      console.error('Error parsing email:', error);
    }
    return null
  }

  private isInvoiceHeuristic(parsed: any): boolean {
    const subject = parsed.subject?.toLowerCase() || '';
    const body = parsed.text?.toLowerCase() || '';
    const html = parsed.html?.toLowerCase() || '';

    const invoiceKeywords = [
      'invoice', 'bill', 'payment', 'receipt', 'statement',
      'due', 'amount', 'total', 'tax', 'vendor', 'supplier'
    ];

    const hasInvoiceKeyword = invoiceKeywords.some(keyword => 
      subject.includes(keyword) || body.includes(keyword) || html.includes(keyword)
    );

    return hasInvoiceKeyword;
  }

  private hasPdfAttachment(parsed: any): boolean {
    return parsed.attachments?.some((att: any) => att.contentType === 'application/pdf') || false
  }

  private async matchKnownVendor(userId: string, parsed: any) {
    try {
      const vendors = await getVendors(userId)
      const fromAddrs: string[] = []
      const from = parsed.from?.value || []
      for (const a of from) {
        if (a.address) fromAddrs.push(a.address.toLowerCase())
      }
      const domains = fromAddrs.map((a) => a.split('@')[1])
      const subj = (parsed.subject || '').toLowerCase()

      for (const v of vendors) {
        if (v.isActive === false) continue
        const emails: string[] = Array.isArray((v as any).fromEmails) ? (v as any).fromEmails : []
        const doms: string[] = Array.isArray((v as any).fromDomains) ? (v as any).fromDomains : []
        const keys: string[] = Array.isArray((v as any).subjectKeywords) ? (v as any).subjectKeywords : []

        if (emails.some((e) => fromAddrs.includes(e.toLowerCase()))) return v
        if (doms.some((d) => domains.includes(d.toLowerCase()))) return v
        if (keys.some((k) => subj.includes(k.toLowerCase()))) return v
      }
    } catch (e) {
      console.warn('[Email] Vendor match failed', e)
    }
    return null
  }

  private async classifyWithLLM(userId: string, parsed: any): Promise<boolean> {
    try {
      const settings = await getSettings(userId)
      const llmSettings = getLLMSettings(settings)
      const fromAddr = parsed.from?.text || ''
      const toAddr = parsed.to?.text || ''
      const subject = parsed.subject || ''
      let bodySnippet = ''
      // Only include small snippet if empty subject or unclear
      if (!subject || subject.length < 8) {
        const text = parsed.text || ''
        bodySnippet = text.substring(0, 240)
      }
      const prompt = `You classify if an email is likely a real bill/invoice we should ingest. 
Fields:
- from: ${fromAddr}
- to: ${toAddr}
- subject: ${subject}
- snippet: ${bodySnippet}

Answer JSON with is_invoice (boolean) and confidence (0-1). Be conservative.`

      const schema = {
        type: 'object',
        properties: {
          is_invoice: { type: 'boolean' },
          confidence: { type: 'number' },
        },
        required: ['is_invoice', 'confidence'],
        additionalProperties: false,
      } as any

      const res = await requestLLM(llmSettings, { prompt, schema })
      if (res.error) return false
      const out: any = res.output
      const isInvoice = Boolean(out.is_invoice)
      const conf = Number(out.confidence || 0)
      return isInvoice && conf >= 0.6
    } catch (e) {
      console.warn('[Email] LLM classify failed', e)
      return false
    }
  }

  private async processInvoiceEmail(parsed: any, envelope: any): Promise<string[] | null> {
    try {
      const user = await getCurrentUser(); // This assumes a single user system for now
      if (!user) return null;

      // Process PDF attachments
      const pdfAttachments = parsed.attachments?.filter((att: any) => 
        att.contentType === 'application/pdf'
      ) || [];

      const hashes: string[] = []
      for (const attachment of pdfAttachments) {
        const hash = crypto.createHash('sha256').update(attachment.content).digest('hex')
        hashes.push(hash)
        await this.processPdfAttachment(attachment, user.id, envelope);
      }

      // Also save the email body as a text file for analysis
      if (parsed.text || parsed.html) {
        await this.saveEmailContent(parsed, user.id, envelope);
      }
      return hashes
    } catch (error) {
      console.error('Error processing invoice email:', error);
      return null
    }
  }

  private async processPdfAttachment(attachment: any, userId: string, envelope: any): Promise<void> {
    const fileUuid = randomUUID();
    const filename = attachment.filename || `invoice_${Date.now()}.pdf`;
    const relativeFilePath = unsortedFilePath(fileUuid, filename);
    const userUploadsDirectory = getUserUploadsDirectory({ id: userId } as any);
    const fullFilePath = safePathJoin(userUploadsDirectory, relativeFilePath);

    // Create directory if it doesn't exist
    await mkdir(path.dirname(fullFilePath), { recursive: true });

    // Save PDF file
    await writeFile(fullFilePath, attachment.content);

    // Create file record in database
    await createFile(userId, {
      id: fileUuid,
      filename,
      path: relativeFilePath,
      mimetype: 'application/pdf',
      metadata: {
        source: 'email',
        from: envelope.from?.[0]?.address,
        subject: envelope.subject,
        receivedDate: new Date().toISOString(),
        size: attachment.content.length
      }
    });

    console.log(`Saved PDF attachment: ${filename}`);
  }

  private async saveEmailContent(parsed: any, userId: string, envelope: any): Promise<void> {
    const fileUuid = randomUUID();
    const filename = `email_${Date.now()}.txt`;
    const relativeFilePath = unsortedFilePath(fileUuid, filename);
    const userUploadsDirectory = getUserUploadsDirectory({ id: userId } as any);
    const fullFilePath = safePathJoin(userUploadsDirectory, relativeFilePath);

    // Create directory if it doesn't exist
    await mkdir(path.dirname(fullFilePath), { recursive: true });

    // Save email content as text
    const emailContent = `From: ${envelope.from?.[0]?.address}
Subject: ${envelope.subject}
Date: ${new Date().toISOString()}

${parsed.text || parsed.html}`;

    await writeFile(fullFilePath, emailContent);

    // Create file record in database
    await createFile(userId, {
      id: fileUuid,
      filename,
      path: relativeFilePath,
      mimetype: 'text/plain',
      metadata: {
        source: 'email',
        from: envelope.from?.[0]?.address,
        subject: envelope.subject,
        receivedDate: new Date().toISOString(),
        size: emailContent.length
      }
    });

    console.log(`Saved email content: ${filename}`);
  }
}

// Default configuration - should be overridden with environment variables
export const defaultEmailConfig: EmailIngestionConfig = {
  host: config.emailIngestion.host,
  port: config.emailIngestion.port,
  secure: config.emailIngestion.secure,
  auth: {
    user: config.emailIngestion.user,
    pass: config.emailIngestion.password
  },
  mailbox: config.emailIngestion.mailbox,
  pollingInterval: config.emailIngestion.pollingInterval
};
