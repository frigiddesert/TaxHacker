import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { mkdir, writeFile } from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';
import { PrismaClient } from '@prisma/client';
import { config } from 'dotenv';

// Load environment variables
config();

// Initialize Prisma client
const prisma = new PrismaClient();

// Email configuration from environment variables
const emailConfig = {
  host: process.env.IMAP_HOST || 'localhost',
  port: parseInt(process.env.IMAP_PORT || '993'),
  secure: process.env.IMAP_SECURE === 'true',
  auth: {
    user: process.env.IMAP_USER || '',
    pass: process.env.IMAP_PASS || ''
  },
  mailbox: process.env.IMAP_MAILBOX || 'INBOX',
  pollingInterval: parseInt(process.env.IMAP_POLLING_INTERVAL || '300000') // 5 minutes default
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
        // Fetch unseen messages
        const messages = await this.client.fetch('1:*', { 
          envelope: true, 
          source: true,
          flags: true
        });

        for await (const message of messages) {
          if (message.flags.has('\\Seen')) {
            console.log('Skipping already seen message');
            continue;
          }

          try {
            await this.processEmail(message.source, message.envelope);
            // Mark as seen after successful processing
            await this.client?.messageFlagsAdd(message.uid, ['\\Seen']);
            console.log('Successfully processed email');
          } catch (error) {
            console.error('Failed to process email:', error);
          }
        }
      } finally {
        lock.release();
      }
    } catch (error) {
      console.error('Error polling emails:', error);
    }
  }

  private async processEmail(emailSource: Buffer, envelope: any): Promise<void> {
    try {
      const parsed = await simpleParser(emailSource);
      
      // Check if this is likely an invoice email
      const isInvoiceEmail = this.isInvoiceEmail(parsed);
      
      if (isInvoiceEmail) {
        await this.processInvoiceEmail(parsed, envelope);
      }
    } catch (error) {
      console.error('Error parsing email:', error);
    }
  }

  private isInvoiceEmail(parsed: any): boolean {
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

    const hasPdfAttachment = parsed.attachments?.some((att: any) => 
      att.contentType === 'application/pdf'
    );

    return hasInvoiceKeyword || hasPdfAttachment;
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
    const fullFilePath = path.join(process.env.UPLOADS_DIR || './uploads', fileRecord.path);
    
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
    const fullFilePath = path.join(process.env.UPLOADS_DIR || './uploads', fileRecord.path);
    
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