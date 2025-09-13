const fs = require('fs');
const { PrismaClient } = require('../prisma/client');

const prisma = new PrismaClient();

function parseCSV(content) {
  const lines = content.split('\n');
  const results = [];
  let headerFound = false;
  
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    
    // Look for the header line
    if (trimmed.startsWith('Account #,Full name')) {
      headerFound = true;
      continue;
    }
    
    // Skip until we find the header
    if (!headerFound) continue;
    
    // Parse CSV line manually (simple version)
    const columns = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < trimmed.length; i++) {
      const char = trimmed[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        columns.push(current.trim().replace(/^"|"$/g, ''));
        current = '';
      } else {
        current += char;
      }
    }
    columns.push(current.trim().replace(/^"|"$/g, ''));
    
    // Skip empty lines or incomplete data
    if (columns.length >= 6 && columns[0] && columns[1]) {
      results.push({
        'Account #': columns[0],
        'Full name': columns[1],
        'Type': columns[2],
        'Detail type': columns[3],
        'Description': columns[4],
        'Total balance': columns[5]
      });
    }
  }
  
  return results;
}

async function importQbAccountsToCategories() {
  try {
    // Get the first user (you can modify this to get specific user)
    const user = await prisma.user.findFirst();
    if (!user) {
      console.error('No user found in database');
      return;
    }

    console.log(`Importing QB accounts as categories for user: ${user.email}`);

    let importedCount = 0;
    let skippedCount = 0;

    // Read and parse the CSV file
    const csvContent = fs.readFileSync('Rim RR, LLC_Account List.csv', 'utf8');
    const results = parseCSV(csvContent);

    console.log(`Found ${results.length} QB accounts to import`);

    // Import each account as a category
    for (const row of results) {
      const accountNumber = row['Account #'].trim();
      const fullName = row['Full name'].trim();
      const type = row['Type'] ? row['Type'].trim() : '';
      const detailType = row['Detail type'] ? row['Detail type'].trim() : '';
      
      // Create a unique code by combining account number and name
      const code = `${accountNumber}-${fullName.toLowerCase().replace(/[^a-z0-9]/g, '-').substring(0, 20)}`;
      
      // Create display name with account number
      const displayName = `${accountNumber} - ${fullName}`;
      
      // Create description from type and detail type
      const description = detailType ? `${type}: ${detailType}` : type;

      try {
        // Check if category already exists
        const existingCategory = await prisma.category.findFirst({
          where: {
            userId: user.id,
            code: code
          }
        });

        if (existingCategory) {
          console.log(`Skipping duplicate: ${displayName}`);
          skippedCount++;
          continue;
        }

        // Create new category
        await prisma.category.create({
          data: {
            userId: user.id,
            code: code,
            name: displayName,
            llm_prompt: `Account: ${fullName}. Type: ${description}. Use this for transactions related to ${fullName.toLowerCase()}.`,
            color: getColorForAccountType(type)
          }
        });

        console.log(`✓ Imported: ${displayName}`);
        importedCount++;

      } catch (error) {
        console.error(`Error importing ${displayName}:`, error.message);
      }
    }

    console.log(`\n=== Import Complete ===`);
    console.log(`Imported: ${importedCount} categories`);
    console.log(`Skipped: ${skippedCount} duplicates`);
    console.log(`Total processed: ${results.length}`);

  } catch (error) {
    console.error('Import failed:', error);
  } finally {
    await prisma.$disconnect();
  }
}

function getColorForAccountType(type) {
  const colors = {
    'Bank': '#2563eb',           // Blue
    'Accounts receivable (A/R)': '#059669', // Green  
    'Accounts payable (A/P)': '#dc2626',    // Red
    'Income': '#16a34a',         // Green
    'Expense': '#ea580c',        // Orange
    'Cost of Goods Sold': '#dc2626', // Red
    'Other Current Asset': '#8b5cf6', // Purple
    'Fixed Asset': '#6b7280',    // Gray
    'Other Asset': '#6b7280',    // Gray
    'Credit Card': '#ef4444',    // Red
    'Long Term Liability': '#991b1b', // Dark Red
    'Equity': '#1f2937'          // Dark Gray
  };
  
  return colors[type] || '#6b7280'; // Default gray
}

// Run the import
importQbAccountsToCategories();