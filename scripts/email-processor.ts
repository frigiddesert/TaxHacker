import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { mkdir, writeFile } from 'fs/promises';
import path from 'path';
import { createHash, randomUUID } from 'crypto';
import { prisma } from '@/lib/db';
import { getUserUploadsDirectory, safePathJoin } from '@/lib/files';
import { config } from 'dotenv';

// Load environment variables: prefer local .env, else fall back to root .env files
config();
// If IMAP_* not set, try loading root .env.sandbox or .env.production based on QBO_ENV, or default .env
if (!process.env.IMAP_HOST && !process.env.EMAIL_INGESTION_HOST) {
  const envName = process.env.QBO_ENV === 'production' ? '.env.production' : '.env.sandbox'
  try { config({ path: path.resolve(__dirname, `../${envName}`) }) } catch {}
  try { config({ path: path.resolve(__dirname, '../.env') }) } catch {}
}

// Use the shared prisma client
function getPrismaClient() {
  return prisma;
}

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

        const user = await getPrismaClient().user.findFirst();
        if (!user) { console.error('No user found in database'); return; }

        // Get the last processed UID for this mailbox
        const last = await getPrismaClient().emailIngestionLog.aggregate({
          _max: { uid: true },
          where: { userId: user.id, mailbox: emailConfig.mailbox, uidValidity },
        });
        const lastUid = last._max.uid ?? 0;

        // Use IMAP search instead of UID ranges to avoid invalid messageset errors
        let searchQuery: any;
        
        if (emailConfig.firstEmailDate) {
          // Search by date if configured
          try {
            const firstDate = new Date(emailConfig.firstEmailDate);
            const dateString = firstDate.toISOString().split('T')[0].replace(/-/g, '-');
            searchQuery = { since: firstDate };
          } catch (dateError) {
            console.error('Invalid firstEmailDate format:', dateError);
            searchQuery = { all: true };
          }
        } else if (lastUid > 0) {
          // Search for UIDs greater than last processed
          searchQuery = { uid: `${lastUid + 1}:*` };
        } else {
          // First run - get recent emails (last 30 days)
          const thirtyDaysAgo = new Date();
          thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
          searchQuery = { since: thirtyDaysAgo };
        }

        console.log('Searching for emails with criteria:', searchQuery);
        
        try {
          const searchResults = await this.client.search(searchQuery);
          
          if (!searchResults || searchResults.length === 0) {
            console.log('No new emails to process');
            return;
          }
          
          console.log(`Found ${searchResults.length} emails to process`);

          const sortedUids = [...searchResults].sort((a, b) => a - b);

          for (const uid of sortedUids) {
            if (uid <= lastUid) continue;

            let message: any;
            try {
              message = await this.client.fetchOne(uid, {
                uid: true,
                envelope: true,
                source: true,
              });
            } catch (fetchError) {
              console.error(`Error fetching UID ${uid}:`, fetchError);
              await this.logFetchFailure(user.id, uid, uidValidity, fetchError);
              continue;
            }

            if (!message) {
              console.warn(`Fetch for UID ${uid} returned empty result`);
              await this.logFetchFailure(user.id, uid, uidValidity, new Error('Empty fetch result'));
              continue;
            }

            if (emailConfig.firstEmailDate) {
              const firstDate = new Date(emailConfig.firstEmailDate);
              const messageDate = message.envelope?.date ? new Date(message.envelope.date) : null;
              if (!messageDate || messageDate < firstDate) {
                continue;
              }
            }

            await this.processMessage(message, user, uidValidity);
          }
        } catch (searchError) {
          console.error('Error searching emails:', searchError);
          return;
        }
      } finally {
        lock.release();
      }
    } catch (error) {
      console.error('Error polling emails:', error);
    }
  }

  private async logFetchFailure(userId: string, uid: number, uidValidity: bigint, err: unknown): Promise<void> {
    const message = err instanceof Error ? err.message : String(err);

    try {
      await getPrismaClient().emailIngestionLog.upsert({
        where: {
          userId_mailbox_uidValidity_uid: {
            userId,
            mailbox: emailConfig.mailbox,
            uidValidity,
            uid,
          },
        },
        update: {
          status: 'error',
          error: message,
        },
        create: {
          userId,
          mailbox: emailConfig.mailbox,
          uidValidity,
          uid,
          messageId: null,
          internalDate: null,
          from: null,
          subject: '',
          status: 'error',
          attachmentHashes: [],
          error: message,
        },
      });
    } catch (loggingError) {
      console.error('Failed to log fetch error:', loggingError);
    }
  }

  private async processMessage(message: any, user: any, uidValidity: bigint): Promise<void> {
    const uid: number = message.uid;
    // insert log row; skip if duplicate
    try {
      await getPrismaClient().emailIngestionLog.create({
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
      const emailLogData = { uid, uidValidity, mailbox: emailConfig.mailbox };
      const hashes = await this.processEmail(message.source as Buffer, message.envelope, emailLogData);
      await getPrismaClient().emailIngestionLog.update({
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
      await getPrismaClient().emailIngestionLog.update({
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

  private async processEmail(emailSource: Buffer, envelope: any, emailLogData: any): Promise<string[] | null> {
    try {
      const parsed = await simpleParser(emailSource);
      const hashes = await this.getHashesIfAllowed(parsed)
      if (!hashes) { console.log('Skipping email: not a known vendor invoice'); return null }
      await this.processInvoiceEmail(parsed, envelope, emailLogData);
      return hashes
    } catch (error) {
      console.error('Error parsing email:', error);
    }
    return null
  }

  private async getHashesIfAllowed(parsed: any): Promise<string[] | null> {
    const subject = parsed.subject?.toLowerCase() || '';
    const body = parsed.text?.toLowerCase() || '';
    const html = (parsed.html ? String(parsed.html).toLowerCase() : '') || '';

    const invoiceKeywords = [
      'invoice', 'bill', 'payment', 'receipt', 'statement',
      'due', 'amount', 'total', 'tax', 'vendor', 'supplier'
    ];

    const hasInvoiceKeyword = invoiceKeywords.some(keyword => subject.includes(keyword) || body.includes(keyword) || html.includes(keyword));

    const pdfs = parsed.attachments?.filter((att: any) => att.contentType === 'application/pdf') || [];
    const hasPdfAttachment = pdfs.length > 0;

    // Known vendor match from DB
    try {
      const user = await getPrismaClient().user.findFirst()
      if (!user) return null
      const vendors = await getPrismaClient().vendor.findMany({ where: { userId: user.id, isActive: true } })
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

  private async processInvoiceEmail(parsed: any, envelope: any, emailLogData: any): Promise<void> {
    try {
      // Get the first user (assuming single user system for now)
      const user = await getPrismaClient().user.findFirst();
      if (!user) {
        console.error('No user found in database');
        return;
      }

      // Process PDF attachments
      const pdfAttachments = parsed.attachments?.filter((att: any) => 
        att.contentType === 'application/pdf'
      ) || [];

      for (const attachment of pdfAttachments) {
        await this.processPdfAttachment(attachment, user.id, envelope, emailLogData);
      }

      // Only save the email body as a text file if there are no PDF attachments
      // This ensures PDF attachments get the full TaxHacker treatment while
      // text-only emails are still processed
      if ((parsed.text || parsed.html) && pdfAttachments.length === 0) {
        await this.saveEmailContent(parsed, user.id, envelope, emailLogData);
      }

    } catch (error) {
      console.error('Error processing invoice email:', error);
    }
  }

  private async processPdfAttachment(attachment: any, userId: string, envelope: any, emailLogData: any): Promise<void> {
    const fileUuid = randomUUID();
    const filename = attachment.filename || `invoice_${Date.now()}.pdf`;
    
    // Get the user to build correct paths
    const user = await getPrismaClient().user.findUnique({ where: { id: userId } });
    if (!user) throw new Error('User not found');
    
    // Use the same path structure as the main application
    const relativePath = `unsorted/${fileUuid.substring(0, 2)}/${fileUuid.substring(2, 4)}/${fileUuid}.pdf`;
    
    // Create file record in database first to get the path
    const fileRecord = await getPrismaClient().file.create({
      data: {
        id: fileUuid,
        userId: userId,
        filename: filename,
        path: relativePath,
        mimetype: 'application/pdf',
        metadata: {
          source: 'email',
          from: envelope.from?.[0]?.address,
          subject: envelope.subject,
          receivedDate: new Date().toISOString(),
          size: attachment.content.length,
          emailUid: emailLogData.uid,
          emailUidValidity: emailLogData.uidValidity,
          emailMailbox: emailLogData.mailbox
        }
      }
    });

    // Save PDF file to the file system using proper user directory structure
    const userUploadsDirectory = getUserUploadsDirectory(user);
    const fullFilePath = safePathJoin(userUploadsDirectory, relativePath);
    
    // Create directory if it doesn't exist
    await mkdir(path.dirname(fullFilePath), { recursive: true });

    // Save PDF file
    await writeFile(fullFilePath, attachment.content);

    console.log(`Saved PDF attachment: ${filename} to ${fullFilePath}`);
    
    // Mark file for AI processing by setting cachedParseResult to null
    // This will trigger the AI analysis in the main application
    await getPrismaClient().file.update({
      where: { id: fileUuid },
      data: { cachedParseResult: undefined }
    });
  }

  private async saveEmailContent(parsed: any, userId: string, envelope: any, emailLogData: any): Promise<void> {
    const fileUuid = randomUUID();
    const filename = `email_${Date.now()}.txt`;
    
    // Get the user to build correct paths
    const user = await getPrismaClient().user.findUnique({ where: { id: userId } });
    if (!user) throw new Error('User not found');
    
    // Use the same path structure as the main application
    const relativePath = `unsorted/${fileUuid.substring(0, 2)}/${fileUuid.substring(2, 4)}/${fileUuid}.txt`;
    
    // Create file record in database first to get the path
    const fileRecord = await getPrismaClient().file.create({
      data: {
        id: fileUuid,
        userId: userId,
        filename: filename,
        path: relativePath,
        mimetype: 'text/plain',
        metadata: {
          source: 'email',
          from: envelope.from?.[0]?.address,
          subject: envelope.subject,
          receivedDate: new Date().toISOString(),
          size: (parsed.text || parsed.html)?.length || 0,
          emailUid: emailLogData.uid,
          emailUidValidity: emailLogData.uidValidity,
          emailMailbox: emailLogData.mailbox
        }
      }
    });

    // Save email content to the file system using proper user directory structure
    const userUploadsDirectory = getUserUploadsDirectory(user);
    const fullFilePath = safePathJoin(userUploadsDirectory, relativePath);
    
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
    await getPrismaClient().file.update({
      where: { id: fileUuid },
      data: { cachedParseResult: undefined }
    });
  }

  // Function to move processed email to "Processed by Accountant" folder
  async moveEmailToProcessedFolder(emailUid: number, emailUidValidity: bigint, emailMailbox: string): Promise<void> {
    try {
      const client = new ImapFlow(emailConfig);
      await client.connect();
      console.log('Connected to IMAP server for email moving');

      // Ensure the "Processed by Accountant" folder exists
      const processedFolderName = 'Processed by Accountant';
      
      try {
        await client.mailboxCreate(processedFolderName);
        console.log(`Created folder: ${processedFolderName}`);
      } catch (error) {
        // Folder might already exist, that's okay
        console.log(`Folder ${processedFolderName} already exists or couldn't be created`);
      }

      // Select the source mailbox
      const lock = await client.getMailboxLock(emailMailbox);
      
      try {
        // Move the email by UID
        await client.messageMove(emailUid, processedFolderName, { uid: true });
        console.log(`Moved email UID ${emailUid} to ${processedFolderName}`);
      } finally {
        lock.release();
      }

      await client.logout();
    } catch (error) {
      console.error('Failed to move email to processed folder:', error);
      // Don't throw - this is not critical to the main workflow
    }
  }
}

// Main function to start the email processor
async function main() {
  // Check if required environment variables are set (fall back to EMAIL_INGESTION_* for compatibility)
  const imapUser = process.env.IMAP_USER || process.env.EMAIL_INGESTION_USER;
  const imapPass = process.env.IMAP_PASS || process.env.EMAIL_INGESTION_PASSWORD;

  if (!imapUser || !imapPass) {
    console.error('IMAP credentials must be set via IMAP_* or EMAIL_INGESTION_* environment variables');
    process.exit(1);
  }

  process.env.IMAP_USER = imapUser;
  process.env.IMAP_PASS = imapPass;

  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL environment variable must be set');
    process.exit(1);
  }

  const emailService = new EmailIngestionService();
  
  // Handle graceful shutdown
  const shutdown = async () => {
    console.log('Shutting down email processor...');
    await emailService.stop();
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

// Export helper function for moving processed emails
export async function moveProcessedEmailToFolder(emailUid: number, emailUidValidity: bigint, emailMailbox: string): Promise<void> {
  const emailService = new EmailIngestionService();
  await emailService.moveEmailToProcessedFolder(emailUid, emailUidValidity, emailMailbox);
}
