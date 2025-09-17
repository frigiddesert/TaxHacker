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
import type { User } from '@/prisma/client';
import { DEFAULT_FETCH_OPTIONS, fetchSequentialMessages } from '@/lib/email/imap';

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
      errors: [],
    };

    try {
      this.client = new ImapFlow({
        host: config.emailIngestion.host,
        port: config.emailIngestion.port,
        secure: config.emailIngestion.secure,
        auth: {
          user: config.emailIngestion.user,
          pass: config.emailIngestion.password,
        },
      });

      await this.client.connect();
      console.log('Connected to IMAP server');

      const mailbox = config.emailIngestion.mailbox || 'INBOX';
      const lock = await this.client.getMailboxLock(mailbox);

      try {
        const mb: any = (this.client as any).mailbox;
        if (!mb) {
          return result;
        }

        const uidValidity = BigInt(mb.uidValidity ?? 0);
        const user = await getCurrentUser();

        const rawUids = await this.client.search({}, { uid: true });
        const messageUids: number[] = Array.isArray(rawUids) ? rawUids : [];
        if (messageUids.length === 0) {
          console.log('No messages found in mailbox');
          return result;
        }

        const sortedUids = [...messageUids].sort((a, b) => a - b);
        let uidsToFetch = sortedUids;

        if (!force) {
          const last = await prisma.emailIngestionLog.aggregate({
            _max: { uid: true },
            where: { userId: user.id, mailbox, uidValidity },
          });
          const lastUid = last._max.uid ?? 0;
          uidsToFetch = sortedUids.filter((uid) => uid > lastUid);
        }

        if (uidsToFetch.length === 0) {
          console.log('No new emails to process');
          return result;
        }

        result.totalFetched = uidsToFetch.length;

        await fetchSequentialMessages(
          this.client,
          uidsToFetch,
          async (uid, message) => {
            const messageId = message.envelope?.messageId || `msg-${uid}`;
            const from = message.envelope?.from?.[0]?.address || 'unknown';
            const subject = message.envelope?.subject || '(no subject)';
            const internalDate = message.internalDate || message.envelope?.date || new Date();

            try {
              console.log(`Processing message ${uid}: ${subject} from ${from}`);
              await prisma.emailIngestionLog.upsert({
                where: {
                  userId_mailbox_uidValidity_uid: {
                    userId: user.id,
                    mailbox,
                    uidValidity,
                    uid,
                  },
                },
                update: {
                  messageId,
                  internalDate: new Date(internalDate),
                  from,
                  subject,
                  status: 'pending',
                  attachmentHashes: [],
                },
                create: {
                  userId: user.id,
                  mailbox,
                  uidValidity,
                  uid,
                  messageId,
                  internalDate: new Date(internalDate),
                  from,
                  subject,
                  status: 'pending',
                  attachmentHashes: [],
                },
              });

              if (!message.source) {
                throw new Error('Empty message source');
              }

              const parsed = await simpleParser(message.source as Buffer);

              await this.saveEmailAsFile(parsed, user, message.envelope, uid, mailbox, uidValidity);

              const pdfAttachments = parsed.attachments?.filter((att: any) => att.contentType === 'application/pdf') || [];
              const attachmentHashes = pdfAttachments.map((attachment: any) =>
                crypto.createHash('sha256').update(attachment.content).digest('hex')
              );

              for (const attachment of pdfAttachments) {
                await this.savePdfAttachment(attachment, user, uid, mailbox, uidValidity);
              }

              await prisma.emailIngestionLog.update({
                where: {
                  userId_mailbox_uidValidity_uid: {
                    userId: user.id,
                    mailbox,
                    uidValidity,
                    uid,
                  },
                },
                data: { status: 'processed', attachmentHashes },
              });

              result.processed++;
            } catch (error: any) {
              result.failed++;
              const errorMessage = error?.message || String(error);
              result.errors.push(`Message ${uid}: ${errorMessage}`);

              try {
                await prisma.emailIngestionLog.update({
                  where: {
                    userId_mailbox_uidValidity_uid: {
                      userId: user.id,
                      mailbox,
                      uidValidity,
                      uid,
                    },
                  },
                  data: { status: 'error', error: errorMessage },
                });
              } catch (updateError) {
                console.error('Failed to update log entry with error status:', updateError);
              }
            }
          },
          {
            fetchOptions: DEFAULT_FETCH_OPTIONS,
            onMissing: async (uid) => {
              console.warn(`Fetch ${uid}: empty result`);
              result.failed++;
              result.errors.push(`Fetch ${uid}: empty result`);
            },
            onError: async (uid, error) => {
              const errorMessage = error instanceof Error ? error.message : String(error);
              console.error(`Error fetching message ${uid}:`, error);
              result.failed++;
              result.errors.push(`Fetch ${uid}: ${errorMessage}`);
            },
          }
        );
      } finally {
        lock.release();
      }

      return result;
    } catch (error: any) {
      const errorMessage = error?.message || String(error);
      result.errors.push(`Connection/Setup error: ${errorMessage}`);
      console.error('Error during email fetch:', error);
      return result;
    } finally {
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

  private async saveEmailAsFile(parsed: any, user: User, envelope: any, uid: number, mailbox: string, uidValidity: bigint): Promise<void> {
    const fileUuid = randomUUID();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `email_${uid}_${timestamp}.txt`;
    const relativeFilePath = unsortedFilePath(fileUuid, filename);
    const userUploadsDirectory = getUserUploadsDirectory(user);
    const fullFilePath = safePathJoin(userUploadsDirectory, relativeFilePath);

    await fs.mkdir(path.dirname(fullFilePath), { recursive: true });

    const emailContent = `From: ${envelope?.from?.[0]?.address || 'Unknown'}
To: ${envelope?.to?.[0]?.address || 'Unknown'}
Subject: ${envelope?.subject || '(no subject)'}
Date: ${envelope?.date ? new Date(envelope.date).toISOString() : new Date().toISOString()}
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
        receivedDate: envelope?.date ? new Date(envelope.date).toISOString() : new Date().toISOString(),
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

  private async savePdfAttachment(attachment: any, user: User, uid: number, mailbox: string, uidValidity: bigint): Promise<void> {
    const fileUuid = randomUUID();
    const filename = attachment.filename || `invoice_${uid}.pdf`;
    const relativeFilePath = unsortedFilePath(fileUuid, filename);
    const userUploadsDirectory = getUserUploadsDirectory(user);
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
