import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { mkdir, writeFile } from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';
import { createFile } from '@/models/files';
import { getCurrentUser } from './auth';
import { getUserUploadsDirectory, safePathJoin, unsortedFilePath } from './files';
import config from './config';

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
        // Fetch unseen messages
        const messages = await this.client.fetch('1:*', { 
          envelope: true, 
          source: true,
          flags: true
        });

        for await (const message of messages) {
          if (message.flags.has('\\Seen')) continue;

          try {
            await this.processEmail(message.source, message.envelope);
            // Mark as seen after successful processing
            await this.client?.messageFlagsAdd(message.uid, ['\\Seen']);
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
      const user = await getCurrentUser(); // This assumes a single user system for now
      if (!user) return;

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