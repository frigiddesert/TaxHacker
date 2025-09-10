#!/bin/bash

# TaxHacker Development Setup Script

echo "🚀 Setting up TaxHacker for local development..."

# Check if .env exists
if [ ! -f .env ]; then
  echo "📝 Creating .env file from .env.example..."
  cp .env.example .env
  echo "✅ Created .env file. Please edit it with your configuration."
  echo "   Key settings to update:"
  echo "   - DATABASE_URL (if different)"
  echo "   - EMAIL_INGESTION_* settings for email processing"
  echo "   - AI API keys (OPENAI_API_KEY, GOOGLE_API_KEY, etc.)"
  echo "   - QBO_* settings for QuickBooks integration"
  echo ""
fi

# Create required directories
echo "📁 Creating required directories..."
mkdir -p data/uploads
mkdir -p dev-pgdata

echo "🐳 Starting Docker services..."
docker-compose -f docker-compose.dev.yml up -d postgres

echo "⏳ Waiting for PostgreSQL to be ready..."
sleep 10

echo "📦 Installing dependencies..."
npm install

echo "🗄️  Running database migrations..."
npm run db:migrate || npx prisma migrate dev

echo "🌱 Generating Prisma client..."
npx prisma generate

echo ""
echo "🎉 Development environment is ready!"
echo ""
echo "To start the application:"
echo "  npm run dev                    # Start Next.js development server"
echo "  OR"
echo "  docker-compose -f docker-compose.dev.yml up app    # Start via Docker"
echo ""
echo "Services:"
echo "  📱 App:      http://localhost:7331"
echo "  🗄️  Database: postgresql://postgres:postgres@localhost:5432/taxhacker"
echo "  🔧 Adminer:  http://localhost:8080 (optional DB admin)"
echo ""
echo "Email Testing:"
echo "  1. Configure EMAIL_INGESTION_* settings in .env"
echo "  2. Visit /unsorted page"
echo "  3. Click 'Check Emails Now' button"
echo ""
echo "📚 Documentation:"
echo "  - Email processing: ./scripts/README.md"
echo "  - QuickBooks setup: ./enhanced-qbo-workflow.md"
echo "  - Vendor features: ./enhanced-vendor-design.md"