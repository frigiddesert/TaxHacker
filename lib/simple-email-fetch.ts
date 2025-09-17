import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { getCurrentUser } from './auth';
import { prisma } from './db';
import config from './config';
import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';
import { getUserUploadsDirectory, safePathJoin, unsortedFilePath } from './files';
import { createFile } from '@/models/files';

export interface SimpleEmailResult {
  totalFetched: number;
  processed: number;
  failed: number;
  errors: string[];
}

export class SimpleEmailFetch {
  private client: ImapFlow | null = null;

  async fetchEmails(force: boolean = false): Promise<SimpleEmailResult> {
    const result: SimpleEmailResult = {
      totalFetched: 0,
      processed: 0, 
      failed: 0,
      errors: []
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
      console.log('Connected to IMAP server');

      // Select mailbox
      const lock = await this.client.getMailboxLock('INBOX');

      try {
        // Get mailbox info
        const mb: any = (this.client as any).mailbox;
        console.log(`Connected to INBOX with ${mb.exists} messages`);
        const existingMessages = mb.exists || 0;

        if (existingMessages === 0) {
          return result;
        }

        // Get last 20 messages for testing
        const messageUids = await this.client.search({}, { uid: true });
        const last20Uids = messageUids.slice(-20);
        console.log(`Fetching last ${last20Uids.length} messages`);

        if (last20Uids.length === 0) {
          console.warn('No message UIDs found to fetch');
          return result;
        }

        // Fetch messages one-by-one to support servers rejecting comma-separated UID ranges
        result.totalFetched = last20Uids.length;
        const uidValidity = BigInt(mb.uidValidity || 0);

        for (const uid of last20Uids) {
          let message: any;

          try {
            message = await this.client.fetchOne(uid, {
              uid: true,
              envelope: true,
              source: true,
              internalDate: true
            });
          } catch (fetchError: any) {
            console.error(`Error fetching message ${uid}:`, fetchError);
            result.errors.push(`Fetch ${uid}: ${fetchError.message}`);
            result.failed++;
            continue;
          }

          if (!message) {
            console.warn(`Fetch for message ${uid} returned empty result`);
            result.errors.push(`Fetch ${uid}: empty result`);
            result.failed++;
            continue;
          }

          try {
            const user = await getCurrentUser();
            if (!user) throw new Error('User not authenticated');

            const messageId = message.envelope?.messageId || `msg-${uid}`;
            const from = message.envelope?.from?.[0]?.address || 'unknown';
            const subject = message.envelope?.subject || '(no subject)';
            const date = message.internalDate || message.envelope?.date || new Date();

            console.log(`Processing message ${uid}: ${subject} from ${from}`);

            // Parse email content
            if (!message.source) {
              throw new Error('Empty message source');
            }

            const parsed = await simpleParser(message.source as Buffer);

            // Save to database as simple log entry
            await prisma.emailIngestionLog.create({
              data: {
                userId: user.id,
                mailbox: 'INBOX',
                uidValidity,
                uid,
                messageId,
                internalDate: new Date(date),
                from,
                subject,
                status: 'pending',
                attachmentHashes: []
              }
            });

            // Save email as text file
            await this.saveEmailAsFile(parsed, user, message.envelope, uid, 'INBOX', uidValidity);

            // Save any PDF attachments
            const pdfAttachments = parsed.attachments?.filter(att =>
              att.contentType === 'application/pdf'
            ) || [];

            for (const attachment of pdfAttachments) {
              await this.savePdfAttachment(attachment, user, uid, 'INBOX', uidValidity);
            }

            // Update status to processed
            await prisma.emailIngestionLog.updateMany({
              where: {
                userId: user.id,
                uid,
                mailbox: 'INBOX'
              },
              data: {
                status: 'processed',
                attachmentHashes: pdfAttachments.map(att =>
                  crypto.createHash('sha256').update(att.content).digest('hex')
                )
              }
            });

            result.processed++;

          } catch (error: any) {
            console.error(`Error processing message ${uid}:`, error);
            result.errors.push(`Message ${uid}: ${error.message}`);
            result.failed++;
          }
        }

      } finally {
        lock.release();
      }

      return result;

    } catch (error: any) {
      result.errors.push(`Connection/Setup error: ${error.message}`);
      console.error('Error during email fetch:', error);
      return result;
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
  }

  private async saveEmailAsFile(parsed: any, user: { id: string; email: string }, envelope: any, uid: number, mailbox: string, uidValidity: bigint): Promise<void> {
    const fileUuid = randomUUID();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `email_${uid}_${timestamp}.txt`;
    const relativeFilePath = unsortedFilePath(fileUuid, filename);
    const userUploadsDirectory = getUserUploadsDirectory(user as any);
    const fullFilePath = safePathJoin(userUploadsDirectory, relativeFilePath);

    await fs.mkdir(path.dirname(fullFilePath), { recursive: true });

    const emailContent = `From: ${envelope?.from?.[0]?.address || 'Unknown'}
To: ${envelope?.to?.[0]?.address || 'Unknown'}
Subject: ${envelope?.subject || '(no subject)'}
Date: ${envelope?.date || new Date()}
Message-ID: ${envelope?.messageId || 'unknown'}

--- Email Content ---

${parsed.text || parsed.html || '(no content)'}`;

    await fs.writeFile(fullFilePath, emailContent);

    await createFile(user.id, {
      id: fileUuid,
      filename,
      path: relativeFilePath,
      mimetype: 'text/plain',
      metadata: {
        source: 'email',
        from: envelope?.from?.[0]?.address,
        subject: envelope?.subject,
        receivedDate: new Date().toISOString(),
        size: emailContent.length,
        seqno: uid,
        emailUid: uid,
        emailUidValidity: uidValidity.toString(),
        emailMailbox: mailbox,
        messageId: envelope?.messageId || null
      }
    });

    console.log(`Saved email: ${filename}`);
  }

  private async savePdfAttachment(attachment: any, user: { id: string; email: string }, uid: number, mailbox: string, uidValidity: bigint): Promise<void> {
    const fileUuid = randomUUID();
    const filename = attachment.filename || `invoice_${uid}.pdf`;
    const relativeFilePath = unsortedFilePath(fileUuid, filename);
    const userUploadsDirectory = getUserUploadsDirectory(user as any);
    const fullFilePath = safePathJoin(userUploadsDirectory, relativeFilePath);

    await fs.mkdir(path.dirname(fullFilePath), { recursive: true });
    await fs.writeFile(fullFilePath, attachment.content);

    await createFile(user.id, {
      id: fileUuid,
      filename,
      path: relativeFilePath,
      mimetype: 'application/pdf',
      metadata: {
        source: 'email',
        size: attachment.content.length,
        seqno: uid,
        attachmentHash: crypto.createHash('sha256').update(attachment.content).digest('hex'),
        emailUid: uid,
        emailUidValidity: uidValidity.toString(),
        emailMailbox: mailbox
      }
    });

    console.log(`Saved PDF: ${filename}`);
  }
}
