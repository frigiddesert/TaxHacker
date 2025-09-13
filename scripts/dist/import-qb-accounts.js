import { readFileSync } from 'fs';
import { parse } from 'csv-parse/sync';
import { PrismaClient } from '@prisma/client';
import { config } from 'dotenv';
import path from 'path';
const prisma = new PrismaClient();
// Load environment variables
config();
async function importQBAccounts() {
    var _a;
    try {
        // Read the CSV file
        const csvPath = path.join(__dirname, '..', 'Rim RR, LLC_Account List.csv');
        const csvContent = readFileSync(csvPath, 'utf-8');
        // Parse CSV - skip header rows and get actual data
        const records = parse(csvContent, {
            columns: true,
            skip_empty_lines: true,
            from: 4, // Skip first 3 rows (header info)
            to: -5 // Skip last 5 rows (footer info)
        });
        console.log(`Found ${records.length} QB accounts to import`);
        // Get the default company and user
        const company = await prisma.company.findFirst({
            where: { id: 'default' }
        });
        if (!company) {
            console.error('Default company not found. Please ensure the migration has been applied.');
            return;
        }
        // Get the first user (since we're importing into default company)
        const user = await prisma.user.findFirst({
            where: { companyId: 'default' }
        });
        if (!user) {
            console.error('No user found for default company');
            return;
        }
        console.log(`Importing accounts for company: ${company.name}, user: ${user.email}`);
        let imported = 0;
        let skipped = 0;
        for (const record of records) {
            // Skip empty rows or rows without account numbers
            if (!record['Account #'] || record['Account #'].trim() === '' || record['Account #'] === 'TOTAL') {
                skipped++;
                continue;
            }
            // Parse balance - remove quotes, commas, and handle negative values
            let balance = null;
            if (record['Total balance'] && record['Total balance'].trim() !== '') {
                const balanceStr = record['Total balance']
                    .replace(/"/g, '') // Remove quotes
                    .replace(/,/g, '') // Remove commas
                    .trim();
                if (balanceStr !== '' && !isNaN(parseFloat(balanceStr))) {
                    balance = parseFloat(balanceStr);
                }
            }
            try {
                // Check if account already exists
                const existingAccount = await prisma.qbAccount.findFirst({
                    where: {
                        companyId: company.id,
                        accountNumber: record['Account #'].trim()
                    }
                });
                if (existingAccount) {
                    console.log(`Account ${record['Account #']} already exists, skipping`);
                    skipped++;
                    continue;
                }
                // Create the QB account
                await prisma.qbAccount.create({
                    data: {
                        companyId: company.id,
                        userId: user.id,
                        accountNumber: record['Account #'].trim(),
                        fullName: record['Full name'].trim(),
                        type: record['Type'].trim(),
                        detailType: record['Detail type'].trim(),
                        description: ((_a = record['Description']) === null || _a === void 0 ? void 0 : _a.trim()) || null,
                        balance: balance,
                        isActive: true
                    }
                });
                imported++;
                console.log(`Imported: ${record['Account #']} - ${record['Full name']}`);
            }
            catch (error) {
                console.error(`Error importing account ${record['Account #']}:`, error);
                skipped++;
            }
        }
        console.log(`\nImport complete!`);
        console.log(`Imported: ${imported} accounts`);
        console.log(`Skipped: ${skipped} accounts`);
    }
    catch (error) {
        console.error('Error importing QB accounts:', error);
    }
    finally {
        await prisma.$disconnect();
    }
}
// Run the import if this script is called directly
if (require.main === module) {
    importQBAccounts();
}
export { importQBAccounts };
