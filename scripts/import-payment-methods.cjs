const fs = require('fs');
const { PrismaClient } = require('../prisma/client');

const prisma = new PrismaClient();

const DEFAULT_PAYMENT_METHODS = [
  { code: 'ach', name: 'ACH Transfer', description: 'Automated Clearing House electronic transfer', sortOrder: 1 },
  { code: 'billpay', name: 'Bill Pay', description: 'Online bill pay through bank', sortOrder: 2 },
  { code: 'autopay', name: 'Autopay', description: 'Automatic recurring payment', sortOrder: 3 },
  { code: 'check', name: 'Check', description: 'Paper check payment', sortOrder: 4 },
  { code: 'wire', name: 'Wire Transfer', description: 'Bank wire transfer', sortOrder: 5 },
  { code: 'credit_card', name: 'Credit Card', description: 'Credit card payment', sortOrder: 6 },
  { code: 'debit_card', name: 'Debit Card', description: 'Debit card payment', sortOrder: 7 },
  { code: 'cash', name: 'Cash', description: 'Cash payment', sortOrder: 8 },
  { code: 'paypal', name: 'PayPal', description: 'PayPal payment', sortOrder: 9 },
  { code: 'venmo', name: 'Venmo', description: 'Venmo payment', sortOrder: 10 },
  { code: 'zelle', name: 'Zelle', description: 'Zelle payment', sortOrder: 11 }
];

async function importPaymentMethods() {
  try {
    // Get the first user (you can modify this to get specific user)
    const user = await prisma.user.findFirst();
    if (!user) {
      console.error('No user found in database. Please log in to the app first to create a user account.');
      return;
    }

    console.log(`Importing payment methods for user: ${user.email}`);

    let importedCount = 0;
    let skippedCount = 0;

    // Import each payment method
    for (const paymentMethod of DEFAULT_PAYMENT_METHODS) {
      try {
        // Check if payment method already exists
        const existingPaymentMethod = await prisma.paymentMethod.findFirst({
          where: {
            userId: user.id,
            code: paymentMethod.code
          }
        });

        if (existingPaymentMethod) {
          console.log(`Skipping duplicate: ${paymentMethod.name}`);
          skippedCount++;
          continue;
        }

        // Create new payment method
        await prisma.paymentMethod.create({
          data: {
            userId: user.id,
            code: paymentMethod.code,
            name: paymentMethod.name,
            description: paymentMethod.description,
            sortOrder: paymentMethod.sortOrder,
            isActive: true,
          }
        });

        console.log(`✓ Imported: ${paymentMethod.name}`);
        importedCount++;

      } catch (error) {
        console.error(`Error importing ${paymentMethod.name}:`, error.message);
      }
    }

    console.log(`\n=== Import Complete ===`);
    console.log(`Imported: ${importedCount} payment methods`);
    console.log(`Skipped: ${skippedCount} duplicates`);
    console.log(`Total processed: ${DEFAULT_PAYMENT_METHODS.length}`);

  } catch (error) {
    console.error('Import failed:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the import
importPaymentMethods();