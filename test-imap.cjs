const { ImapFlow } = require('imapflow');
const { config } = require('dotenv');
const path = require('path');

// Load environment variables from .env file
config({ path: path.resolve(__dirname, '.env') });

// Debug: Check if password is loaded
console.log('Environment variables:');
console.log(`EMAIL_INGESTION_PASSWORD: ${process.env.EMAIL_INGESTION_PASSWORD ? 'SET (' + process.env.EMAIL_INGESTION_PASSWORD.length + ' chars)' : 'NOT SET'}`);
console.log('');

async function testIMAP() {
  console.log('🔌 Testing IMAP connection...');
  console.log(`Host: ${process.env.EMAIL_INGESTION_HOST}`);
  console.log(`Port: ${process.env.EMAIL_INGESTION_PORT}`);
  console.log(`User: ${process.env.EMAIL_INGESTION_USER}`);
  console.log(`Mailbox: ${process.env.EMAIL_INGESTION_MAILBOX}`);
  console.log('');

  const client = new ImapFlow({
    host: process.env.EMAIL_INGESTION_HOST,
    port: parseInt(process.env.EMAIL_INGESTION_PORT),
    secure: process.env.EMAIL_INGESTION_SECURE === 'true',
    auth: {
      user: process.env.EMAIL_INGESTION_USER,
      pass: process.env.EMAIL_INGESTION_PASSWORD
    }
  });

  try {
    await client.connect();
    console.log('✅ Connected to IMAP server successfully');

    // Get mailbox info
    const lock = await client.getMailboxLock(process.env.EMAIL_INGESTION_MAILBOX || 'INBOX');
    
    try {
      const mailboxInfo = client.mailbox;
      console.log(`📬 Mailbox Info:`);
      console.log(`   Total Messages: ${mailboxInfo.exists}`);
      console.log(`   Recent Messages: ${mailboxInfo.recent}`);
      console.log(`   UID Validity: ${mailboxInfo.uidValidity}`);
      console.log(`   UID Next: ${mailboxInfo.uidNext}`);
      console.log('');

      // Search for emails from last 30 days
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 30);
      
      console.log(`🔍 Searching for emails from ${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]}...`);
      
      try {
        const searchResults = await client.search({
          since: startDate,
          before: endDate
        }, { uid: true });

        console.log(`📋 Found ${searchResults.length} messages in date range`);
        console.log('');

        if (searchResults.length === 0) {
          throw new Error('No messages in date range, showing all messages');
        }

        console.log('📨 Message headers (most recent 10):');
        const recentUids = searchResults.slice(-10);
        
        for await (const message of client.fetch(recentUids, { 
          uid: true, 
          envelope: true, 
          internalDate: true 
        })) {
          console.log(`\n--- Message UID: ${message.uid} ---`);
          console.log(`From: ${message.envelope.from?.[0]?.address || 'Unknown'}`);
          console.log(`To: ${message.envelope.to?.[0]?.address || 'Unknown'}`);
          console.log(`Subject: ${message.envelope.subject || '(no subject)'}`);
          console.log(`Date: ${message.envelope.date || message.internalDate || 'Unknown'}`);
          console.log(`Message-ID: ${message.envelope.messageId || 'Unknown'}`);
        }

      } catch (dateSearchError) {
        console.log('❌ Date search failed, showing ALL messages in mailbox...');
        
        // Let's try searching for all messages instead
        console.log('🔍 Searching for ALL messages in mailbox...');
        const allMessages = await client.search({}, { uid: true });
        console.log(`📋 Total messages in mailbox: ${allMessages.length}`);
        
        if (allMessages.length > 0) {
          console.log('📨 Getting headers for ALL messages...');
          
          for await (const message of client.fetch(`1:*`, { 
            uid: true, 
            envelope: true, 
            internalDate: true 
          })) {
            console.log(`\n--- Message UID: ${message.uid} ---`);
            console.log(`From: ${message.envelope.from?.[0]?.address || 'Unknown'}`);
            console.log(`To: ${message.envelope.to?.[0]?.address || 'Unknown'}`);
            console.log(`Subject: ${message.envelope.subject || '(no subject)'}`);
            console.log(`Date: ${message.envelope.date || message.internalDate || 'Unknown'}`);
            console.log(`Message-ID: ${message.envelope.messageId || 'Unknown'}`);
          }
        } else {
          console.log('❌ No messages found in mailbox at all');
        }
      }

    } finally {
      lock.release();
    }

  } catch (error) {
    console.error('❌ IMAP Error:', error);
    
    if (error.code === 'ENOTFOUND') {
      console.error('   → DNS resolution failed. Check the hostname.');
    } else if (error.code === 'ECONNREFUSED') {
      console.error('   → Connection refused. Check the port and firewall.');
    } else if (error.code === 'ETIMEDOUT') {
      console.error('   → Connection timeout. Check network connectivity.');
    } else if (error.message?.includes('Invalid credentials')) {
      console.error('   → Authentication failed. Check username/password.');
    }
  } finally {
    if (client) {
      try {
        await client.logout();
        console.log('\n🔌 Disconnected from IMAP server');
      } catch (e) {
        console.error('Error during logout:', e.message);
      }
    }
  }
}

// Run the test
testIMAP().catch(console.error);