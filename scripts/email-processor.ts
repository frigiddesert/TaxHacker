import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { mkdir, writeFile } from 'fs/promises';
import path from 'path';
import { createHash, randomUUID } from 'crypto';
import { PrismaClient } from '@prisma/client';
import { config } from 'dotenv';

// Load environment variables: prefer local .env, else fall back to root .env files
config();
// If IMAP_* not set, try loading root .env.sandbox or .env.production based on QBO_ENV, or default .env
if (!process.env.IMAP_HOST && !process.env.EMAIL_INGESTION_HOST) {
  const envName = process.env.QBO_ENV === 'production' ? '.env.production' : '.env.sandbox'
  try { config({ path: path.resolve(__dirname, `../${envName}`) }) } catch {}
  try { config({ path: path.resolve(__dirname, '../.env') }) } catch {}
}

// Initialize Prisma client
const prisma = new PrismaClient();

// Email configuration from environment variables
const emailConfig = {
  host: process.env.IMAP_HOST || process.env.EMAIL_INGESTION_HOST || 'localhost',
  port: parseInt(process.env.IMAP_PORT || process.env.EMAIL_INGESTION_PORT || '993'),
  secure: (process.env.IMAP_SECURE ?? process.env.EMAIL_INGESTION_SECURE) === 'true',
  auth: {
    user: process.env.IMAP_USER || process.env.EMAIL_INGESTION_USER || '',
    pass: process.env.IMAP_PASS || process.env.EMAIL_INGESTION_PASSWORD || ''
  },
  mailbox: process.env.IMAP_MAILBOX || process.env.EMAIL_INGESTION_MAILBOX || 'INBOX',
  pollingInterval: parseInt(process.env.IMAP_POLLING_INTERVAL || process.env.EMAIL_INGESTION_POLLING_INTERVAL || '300000'), // 5 minutes default
  firstEmailDate: process.env.EMAIL_INGESTION_FIRST_EMAIL_DATE || '' // YYYY-MM-DD format
};

// Email ingestion service class
class EmailIngestionService {
  private client: ImapFlow | null = null;
  private pollingInterval: NodeJS.Timeout | null = null;

  async start(): Promise<void> {
    try {
      this.client = new ImapFlow(emailConfig);
      await this.client.connect();
      console.log('Email ingestion service connected');

      // Start polling immediately and then on schedule
      await this.pollEmails();
      this.pollingInterval = setInterval(() => this.pollEmails(), emailConfig.pollingInterval);
    } catch (error) {
      console.error('Failed to start email ingestion service:', error);
      throw error;
    }
  }

  async checkOnce(): Promise<void> {
    try {
      this.client = new ImapFlow(emailConfig);
      await this.client.connect();
      console.log('Email ingestion service connected for one-time check');

      // Check emails once without setting up polling
      await this.pollEmails();
      console.log('One-time email check completed');
    } catch (error) {
      console.error('Failed to perform one-time email check:', error);
      throw error;
    } finally {
      // Always disconnect after one-time check
      if (this.client) {
        await this.client.logout();
        this.client = null;
      }
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
      console.log('Polling emails...');
      const lock = await this.client.getMailboxLock(emailConfig.mailbox);
      try {
        const mb: any = (this.client as any).mailbox;
        if (!mb) return;
        const uidValidity = BigInt(mb.uidValidity ?? 0);
        const uidNext = mb.uidNext || 1;

        const user = await prisma.user.findFirst();
        if (!user) { console.error('No user found in database'); return; }

        const last = await prisma.emailIngestionLog.aggregate({
          _max: { uid: true },
          where: { userId: user.id, mailbox: emailConfig.mailbox, uidValidity },
        });
        const lastUid = last._max.uid ?? 0;
        const startUid = lastUid + 1;
        const endUid = Math.max(startUid, uidNext - 1);
        if (endUid < startUid) return;
        const range = `${startUid}:${endUid}`;

        let searchCriteria = range;
        
        // Apply date filtering if firstEmailDate is configured
        if (emailConfig.firstEmailDate) {
          try {
            const firstDate = new Date(emailConfig.firstEmailDate);
            const messages = await this.client.fetch(range, { uid: true, envelope: true, source: true });
            
            // Filter messages manually by date since IMAP date search can be unreliable
            const filteredMessages: any[] = [];
            for await (const message of messages) {
              const messageDate = message.envelope?.date ? new Date(message.envelope.date) : null;
              if (messageDate && messageDate >= firstDate) {
                filteredMessages.push(message);
              }
            }
            
            // Process filtered messages
            for (const message of filteredMessages) {
              await this.processMessage(message, user, uidValidity);
            }
            return;
          } catch (dateError) {
            console.error('Invalid firstEmailDate format, processing all messages:', dateError);
          }
        }

        // Fallback: process all messages if no date filter
        const messages = await this.client.fetch(range, { uid: true, envelope: true, source: true });

        for await (const message of messages) {
          await this.processMessage(message, user, uidValidity);
        }
      } finally {
        lock.release();
      }
    } catch (error) {
      console.error('Error polling emails:', error);
    }
  }

  private async processMessage(message: any, user: any, uidValidity: bigint): Promise<void> {
    const uid: number = message.uid;
    // insert log row; skip if duplicate
    try {
      await prisma.emailIngestionLog.create({
        data: {
          userId: user.id,
          mailbox: emailConfig.mailbox,
          uidValidity,
          uid,
          messageId: message.envelope?.messageId || null,
          internalDate: message.envelope?.date || null,
          from: message.envelope?.from?.map((a: any) => a.address || a.name).join(', '),
          subject: message.envelope?.subject || '',
          status: 'pending',
        },
      });
    } catch { /* duplicate */ }

    try {
      if (!message.source) throw new Error('Empty message source');
      const hashes = await this.processEmail(message.source as Buffer, message.envelope);
      await prisma.emailIngestionLog.update({
        where: {
          userId_mailbox_uidValidity_uid: {
            userId: user.id,
            mailbox: emailConfig.mailbox,
            uidValidity,
            uid,
          },
        },
        data: { status: 'processed', attachmentHashes: hashes || [] },
      });
      console.log('Successfully processed email');
    } catch (error) {
      console.error('Failed to process email:', error);
      await prisma.emailIngestionLog.update({
        where: {
          userId_mailbox_uidValidity_uid: {
            userId: user.id,
            mailbox: emailConfig.mailbox,
            uidValidity,
            uid,
          },
        },
        data: { status: 'error', error: error instanceof Error ? error.message : String(error) },
      });
    }
  }

  private async processEmail(emailSource: Buffer, envelope: any): Promise<string[] | null> {
    try {
      const parsed = await simpleParser(emailSource);
      const hashes = await this.getHashesIfAllowed(parsed)
      if (!hashes) { console.log('Skipping email: not a known vendor invoice'); return null }
      await this.processInvoiceEmail(parsed, envelope);
      return hashes
    } catch (error) {
      console.error('Error parsing email:', error);
    }
    return null
  }

  private async getHashesIfAllowed(parsed: any): Promise<string[] | null> {
    const subject = parsed.subject?.toLowerCase() || '';
    const body = parsed.text?.toLowerCase() || '';
    const html = parsed.html?.toLowerCase() || '';

    const invoiceKeywords = [
      'invoice', 'bill', 'payment', 'receipt', 'statement',
      'due', 'amount', 'total', 'tax', 'vendor', 'supplier'
    ];

    const hasInvoiceKeyword = invoiceKeywords.some(keyword => subject.includes(keyword) || body.includes(keyword) || html.includes(keyword));

    const pdfs = parsed.attachments?.filter((att: any) => att.contentType === 'application/pdf') || [];
    const hasPdfAttachment = pdfs.length > 0;

    // Known vendor match from DB
    try {
      const user = await prisma.user.findFirst()
      if (!user) return null
      const vendors = await prisma.vendor.findMany({ where: { userId: user.id, isActive: true } })
      const fromAddrs: string[] = []
      const from = parsed.from?.value || []
      for (const a of from) {
        if (a.address) fromAddrs.push(a.address.toLowerCase())
      }
      const domains = fromAddrs.map((a) => a.split('@')[1])
      for (const v of vendors) {
        const emails: string[] = Array.isArray((v as any).fromEmails) ? (v as any).fromEmails : []
        const doms: string[] = Array.isArray((v as any).fromDomains) ? (v as any).fromDomains : []
        const keys: string[] = Array.isArray((v as any).subjectKeywords) ? (v as any).subjectKeywords : []
        if (emails.some((e) => fromAddrs.includes(e.toLowerCase()))) return hasPdfAttachment ? pdfs.map((p: any) => createHash('sha256').update(p.content).digest('hex')) : null
        if (doms.some((d) => domains.includes(d.toLowerCase()))) return hasPdfAttachment ? pdfs.map((p: any) => createHash('sha256').update(p.content).digest('hex')) : null
        if (keys.some((k) => subject.includes(k.toLowerCase()))) return hasPdfAttachment ? pdfs.map((p: any) => createHash('sha256').update(p.content).digest('hex')) : null
      }
    } catch (e) {
      console.error('Vendor match failed', e)
    }

    // Default: require both keyword and PDF to ingest
    return hasInvoiceKeyword && hasPdfAttachment ? pdfs.map((p: any) => createHash('sha256').update(p.content).digest('hex')) : null;
  }

  private async processInvoiceEmail(parsed: any, envelope: any): Promise<void> {
    try {
      // Get the first user (assuming single user system for now)
      const user = await prisma.user.findFirst();
      if (!user) {
        console.error('No user found in database');
        return;
      }

      // Process PDF attachments
      const pdfAttachments = parsed.attachments?.filter((att: any) => 
        att.contentType === 'application/pdf'
      ) || [];

      for (const attachment of pdfAttachments) {
        await this.processPdfAttachment(attachment, user.id, envelope);
      }

      // Also save the email body as a text file for analysis
      if (parsed.text || parsed.html) {
        await this.saveEmailContent(parsed, user.id, envelope);
      }

    } catch (error) {
      console.error('Error processing invoice email:', error);
    }
  }

  private async processPdfAttachment(attachment: any, userId: string, envelope: any): Promise<void> {
    const fileUuid = randomUUID();
    const filename = attachment.filename || `invoice_${Date.now()}.pdf`;
    
    // Create file record in database first to get the path
    const fileRecord = await prisma.file.create({
      data: {
        id: fileUuid,
        userId: userId,
        filename: filename,
        path: `unsorted/${fileUuid.substring(0, 2)}/${fileUuid.substring(2, 4)}/${fileUuid}.pdf`,
        mimetype: 'application/pdf',
        metadata: {
          source: 'email',
          from: envelope.from?.[0]?.address,
          subject: envelope.subject,
          receivedDate: new Date().toISOString(),
          size: attachment.content.length
        }
      }
    });

    // Save PDF file to the file system
    const fullFilePath = path.join(process.env.UPLOAD_PATH || process.env.UPLOADS_DIR || './uploads', fileRecord.path);
    
    // Create directory if it doesn't exist
    await mkdir(path.dirname(fullFilePath), { recursive: true });

    // Save PDF file
    await writeFile(fullFilePath, attachment.content);

    console.log(`Saved PDF attachment: ${filename} to ${fullFilePath}`);
    
    // Mark file for AI processing by setting cachedParseResult to null
    // This will trigger the AI analysis in the main application
    await prisma.file.update({
      where: { id: fileUuid },
      data: { cachedParseResult: null }
    });
  }

  private async saveEmailContent(parsed: any, userId: string, envelope: any): Promise<void> {
    const fileUuid = randomUUID();
    const filename = `email_${Date.now()}.txt`;
    
    // Create file record in database first to get the path
    const fileRecord = await prisma.file.create({
      data: {
        id: fileUuid,
        userId: userId,
        filename: filename,
        path: `unsorted/${fileUuid.substring(0, 2)}/${fileUuid.substring(2, 4)}/${fileUuid}.txt`,
        mimetype: 'text/plain',
        metadata: {
          source: 'email',
          from: envelope.from?.[0]?.address,
          subject: envelope.subject,
          receivedDate: new Date().toISOString(),
          size: (parsed.text || parsed.html)?.length || 0
        }
      }
    });

    // Save email content to the file system
    const fullFilePath = path.join(process.env.UPLOAD_PATH || process.env.UPLOADS_DIR || './uploads', fileRecord.path);
    
    // Create directory if it doesn't exist
    await mkdir(path.dirname(fullFilePath), { recursive: true });

    // Save email content as text
    const emailContent = `From: ${envelope.from?.[0]?.address}
Subject: ${envelope.subject}
Date: ${new Date().toISOString()}

${parsed.text || parsed.html}`;

    await writeFile(fullFilePath, emailContent);

    console.log(`Saved email content: ${filename} to ${fullFilePath}`);
    
    // Mark file for AI processing by setting cachedParseResult to null
    // This will trigger the AI analysis in the main application
    await prisma.file.update({
      where: { id: fileUuid },
      data: { cachedParseResult: null }
    });
  }
}

// Main function to start the email processor
async function main() {
  // Check if required environment variables are set
  if (!process.env.IMAP_USER || !process.env.IMAP_PASS) {
    console.error('IMAP_USER and IMAP_PASS environment variables must be set');
    process.exit(1);
  }

  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL environment variable must be set');
    process.exit(1);
  }

  const emailService = new EmailIngestionService();
  
  // Handle graceful shutdown
  const shutdown = async () => {
    console.log('Shutting down email processor...');
    await emailService.stop();
    await prisma.$disconnect();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  try {
    await emailService.start();
    console.log('Email processor started successfully');
  } catch (error) {
    console.error('Failed to start email processor:', error);
    process.exit(1);
  }
}

// Run the main function if this script is executed directly
if (require.main === module) {
  main().catch(console.error);
}

export default EmailIngestionService;
