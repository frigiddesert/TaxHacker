import { EmailIngestionService, defaultEmailConfig } from './email-ingestion';

let emailService: EmailIngestionService | null = null;

export async function startEmailIngestionService(): Promise<void> {
  // Check if email ingestion is configured
  if (!process.env.EMAIL_INGESTION_USER || !process.env.EMAIL_INGESTION_PASSWORD) {
    console.log('Email ingestion not configured - skipping service startup');
    return;
  }

  try {
    emailService = new EmailIngestionService(defaultEmailConfig);
    await emailService.start();
    console.log('Email ingestion service started successfully');
  } catch (error) {
    console.error('Failed to start email ingestion service:', error);
    // Don't throw, just log - the main app should continue running
  }
}

export async function stopEmailIngestionService(): Promise<void> {
  if (emailService) {
    try {
      await emailService.stop();
      console.log('Email ingestion service stopped');
    } catch (error) {
      console.error('Error stopping email ingestion service:', error);
    } finally {
      emailService = null;
    }
  }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  await stopEmailIngestionService();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await stopEmailIngestionService();
  process.exit(0);
});