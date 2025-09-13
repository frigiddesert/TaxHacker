import Imap from 'imap';
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
  async fetchEmails(force: boolean = false): Promise<SimpleEmailResult> {
    const result: SimpleEmailResult = {
      totalFetched: 0,
      processed: 0, 
      failed: 0,
      errors: []
    };

    return new Promise((resolve, reject) => {
      const imap = new Imap({
        user: config.emailIngestion.user,
        password: config.emailIngestion.password,
        host: config.emailIngestion.host,
        port: config.emailIngestion.port,
        tls: config.emailIngestion.secure,
        tlsOptions: { servername: config.emailIngestion.host }
      });

      const openInbox = (cb: (err: Error | null, box?: any) => void) => {
        imap.openBox('INBOX', true, cb);
      };

      imap.once('ready', () => {
        openInbox(async (err, box) => {
          if (err) {
            result.errors.push(`Failed to open inbox: ${err.message}`);
            imap.end();
            resolve(result);
            return;
          }

          console.log(`Connected to INBOX with ${box.messages.total} messages`);
          result.totalFetched = box.messages.total;

          if (box.messages.total === 0) {
            imap.end();
            resolve(result);
            return;
          }

          // Get last 20 messages for testing
          const fetchRange = Math.max(1, box.messages.total - 19) + ':*';
          console.log(`Fetching messages: ${fetchRange}`);

          const f = imap.seq.fetch(fetchRange, {
            bodies: '',
            struct: true,
            envelope: true
          });

          f.on('message', (msg, seqno) => {
            console.log(`Processing message ${seqno}`);
            let buffer = Buffer.alloc(0);
            
            msg.on('body', (stream) => {
              stream.on('data', (chunk) => {
                buffer = Buffer.concat([buffer, chunk]);
              });
            });

            msg.once('attributes', async (attrs) => {
              try {
                const user = await getCurrentUser();
                if (!user) throw new Error('User not authenticated');

                // Parse email content
                const parsed = await simpleParser(buffer);
                
                const messageId = attrs.envelope?.['message-id'] || `msg-${seqno}`;
                const from = attrs.envelope?.from?.[0]?.address || 'unknown';
                const subject = attrs.envelope?.subject || '(no subject)';
                const date = attrs.envelope?.date || new Date();

                console.log(`Email: ${subject} from ${from}`);

                // Save to database as simple log entry
                await prisma.emailIngestionLog.create({
                  data: {
                    userId: user.id,
                    mailbox: 'INBOX',
                    uidValidity: BigInt(box.uidvalidity || 0),
                    uid: seqno,
                    messageId,
                    internalDate: new Date(date),
                    from,
                    subject,
                    status: 'pending',
                    attachmentHashes: []
                  }
                });

                // Save email as text file
                await this.saveEmailAsFile(parsed, user, attrs.envelope, seqno, 'INBOX', BigInt(box.uidvalidity || 0));

                // Save any PDF attachments
                const pdfAttachments = parsed.attachments?.filter(att => 
                  att.contentType === 'application/pdf'
                ) || [];

                for (const attachment of pdfAttachments) {
                  await this.savePdfAttachment(attachment, user, seqno, 'INBOX', BigInt(box.uidvalidity || 0));
                }

                // Update status to processed
                await prisma.emailIngestionLog.updateMany({
                  where: {
                    userId: user.id,
                    uid: seqno,
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
                console.error(`Error processing message ${seqno}:`, error);
                result.errors.push(`Message ${seqno}: ${error.message}`);
                result.failed++;
              }
            });
          });

          f.once('error', (err) => {
            console.error('Fetch error:', err);
            result.errors.push(`Fetch error: ${err.message}`);
            imap.end();
            resolve(result);
          });

          f.once('end', () => {
            console.log('Fetch completed');
            imap.end();
            resolve(result);
          });
        });
      });

      imap.once('error', (err) => {
        console.error('IMAP error:', err);
        result.errors.push(`IMAP error: ${err.message}`);
        resolve(result);
      });

      imap.once('end', () => {
        console.log('IMAP connection ended');
      });

      console.log('Connecting to IMAP server...');
      imap.connect();
    });
  }

  private async saveEmailAsFile(parsed: any, user: { id: string; email: string }, envelope: any, seqno: number, mailbox: string, uidValidity: bigint): Promise<void> {
    const fileUuid = randomUUID();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `email_${seqno}_${timestamp}.txt`;
    const relativeFilePath = unsortedFilePath(fileUuid, filename);
    const userUploadsDirectory = getUserUploadsDirectory(user as any);
    const fullFilePath = safePathJoin(userUploadsDirectory, relativeFilePath);

    await fs.mkdir(path.dirname(fullFilePath), { recursive: true });

    const emailContent = `From: ${envelope?.from?.[0]?.address || 'Unknown'}
To: ${envelope?.to?.[0]?.address || 'Unknown'}
Subject: ${envelope?.subject || '(no subject)'}
Date: ${envelope?.date || new Date()}
Message-ID: ${envelope?.['message-id'] || 'unknown'}

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
        seqno,
        emailUid: seqno,
        emailUidValidity: uidValidity.toString(),
        emailMailbox: mailbox,
        messageId: envelope?.['message-id'] || null
      }
    });

    console.log(`Saved email: ${filename}`);
  }

  private async savePdfAttachment(attachment: any, user: { id: string; email: string }, seqno: number, mailbox: string, uidValidity: bigint): Promise<void> {
    const fileUuid = randomUUID();
    const filename = attachment.filename || `invoice_${seqno}.pdf`;
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
        seqno,
        attachmentHash: crypto.createHash('sha256').update(attachment.content).digest('hex'),
        emailUid: seqno,
        emailUidValidity: uidValidity.toString(),
        emailMailbox: mailbox
      }
    });

    console.log(`Saved PDF: ${filename}`);
  }
}
