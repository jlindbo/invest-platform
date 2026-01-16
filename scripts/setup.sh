#!/bin/bash
set -e

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}   J Group Invest Corp - Norwegian Stock Market Platform${NC}"
echo -e "${BLUE}   Setup Script${NC}"
echo -e "${BLUE}════════════════════════════════════════════════════════════${NC}\n"

# Check prerequisites
echo -e "${YELLOW}📋 Checking prerequisites...${NC}"

if ! command -v docker &> /dev/null; then
    echo -e "${RED}❌ Docker is not installed. Please install Docker first.${NC}"
    exit 1
fi

if ! command -v docker-compose &> /dev/null; then
    if ! docker compose version &> /dev/null; then
        echo -e "${RED}❌ Docker Compose is not installed. Please install Docker Compose first.${NC}"
        exit 1
    fi
    DOCKER_COMPOSE="docker compose"
else
    DOCKER_COMPOSE="docker-compose"
fi

echo -e "${GREEN}✅ Docker and Docker Compose are installed${NC}\n"

# Generate secure passwords
echo -e "${YELLOW}🔐 Generating secure passwords...${NC}"

if command -v openssl &> /dev/null; then
    POSTGRES_PASSWORD=$(openssl rand -base64 32 | tr -d "=+/" | cut -c1-25)
    REDIS_PASSWORD=$(openssl rand -base64 32 | tr -d "=+/" | cut -c1-25)
else
    # Fallback if openssl is not available
    POSTGRES_PASSWORD=$(date +%s | sha256sum | base64 | head -c 25)
    REDIS_PASSWORD=$(date +%s | sha256sum | base64 | head -c 25)
fi

echo -e "${GREEN}✅ Passwords generated${NC}\n"

# Create .env files
echo -e "${YELLOW}📝 Creating environment configuration files...${NC}"

# Root .env file
cat > .env << EOF
# Generated on $(date)
POSTGRES_PASSWORD=$POSTGRES_PASSWORD
REDIS_PASSWORD=$REDIS_PASSWORD
LOG_LEVEL=info
EOF

# Backend .env
cat > backend/.env << EOF
# Backend Environment Configuration
NODE_ENV=development
PORT=3000

# Database
DATABASE_URL=postgresql://invest_user:$POSTGRES_PASSWORD@localhost:5432/invest_db

# Redis
REDIS_URL=redis://:$REDIS_PASSWORD@localhost:6379
REDIS_PASSWORD=$REDIS_PASSWORD

# ML Service
ML_SERVICE_URL=http://localhost:8000

# Scraping Configuration
USER_AGENT=JGroupInvest/1.0 (Educational Purpose)
SCRAPING_DELAY_MS=2000
MAX_CONCURRENT_SCRAPERS=3

# Logging
LOG_LEVEL=info
LOG_FILE=./logs/app.log

# Bull Queue
BULL_REDIS_HOST=localhost
BULL_REDIS_PORT=6379

# API Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100

# CORS
CORS_ORIGIN=http://localhost:5173

# Job Schedules (cron format)
PRICE_COLLECTION_SCHEDULE=0 16 * * 1-5
NEWS_SCRAPING_SCHEDULE=0 */2 * * *
PREDICTION_SCHEDULE=0 6 * * 1-5
OPPORTUNITY_SCAN_SCHEDULE=*/30 * * * *
EOF

# ML Service .env
cat > ml-service/.env << EOF
# ML Service Environment Configuration

# Database
DATABASE_URL=postgresql://invest_user:$POSTGRES_PASSWORD@localhost:5432/invest_db

# Redis
REDIS_URL=redis://:$REDIS_PASSWORD@localhost:6379

# Model Configuration
MODEL_PATH=/app/data/models
DATA_PATH=/app/data

# LSTM Configuration
LSTM_LOOKBACK_DAYS=60
LSTM_BATCH_SIZE=32
LSTM_EPOCHS=50
LSTM_LEARNING_RATE=0.001

# Sentiment Model
SENTIMENT_MODEL_NAME=ltgoslo/norbert
SENTIMENT_MAX_LENGTH=512

# Training
TRAIN_TEST_SPLIT=0.15
VALIDATION_SPLIT=0.15
EARLY_STOPPING_PATIENCE=10

# Feature Engineering
USE_TECHNICAL_INDICATORS=true
USE_SENTIMENT_FEATURES=true
USE_VOLUME_FEATURES=true

# Logging
LOG_LEVEL=info
LOG_FILE=/app/logs/ml-service.log

# API
API_HOST=0.0.0.0
API_PORT=8000
EOF

# Frontend .env
cat > frontend/.env << EOF
# Frontend Environment Configuration

# API Configuration
VITE_API_URL=http://localhost:3000/api/v1
VITE_WS_URL=ws://localhost:3000

# Environment
VITE_ENV=development

# Feature Flags
VITE_ENABLE_ALERTS=true
VITE_ENABLE_ANALYTICS=true
EOF

echo -e "${GREEN}✅ Environment files created${NC}\n"

# Start infrastructure services first
echo -e "${YELLOW}🐳 Starting PostgreSQL and Redis...${NC}"
$DOCKER_COMPOSE up -d postgres redis

echo -e "${YELLOW}⏳ Waiting for services to be ready...${NC}"
sleep 10

# Check if services are healthy
echo -e "${YELLOW}🏥 Checking service health...${NC}"
max_attempts=30
attempt=0

while [ $attempt -lt $max_attempts ]; do
    if docker exec invest-postgres pg_isready -U invest_user -d invest_db > /dev/null 2>&1; then
        echo -e "${GREEN}✅ PostgreSQL is ready${NC}"
        break
    fi
    attempt=$((attempt + 1))
    sleep 2
done

if [ $attempt -eq $max_attempts ]; then
    echo -e "${RED}❌ PostgreSQL failed to start${NC}"
    exit 1
fi

# Setup backend
echo -e "\n${YELLOW}📦 Setting up backend...${NC}"
cd backend

# Install dependencies
echo -e "${YELLOW}   Installing Node.js dependencies...${NC}"
npm install > /dev/null 2>&1

# Generate Prisma client
echo -e "${YELLOW}   Generating Prisma client...${NC}"
npx prisma generate > /dev/null 2>&1

# Run migrations
echo -e "${YELLOW}   Running database migrations...${NC}"
npx prisma migrate dev --name init --skip-generate > /dev/null 2>&1 || true

# Seed database
echo -e "${YELLOW}   Seeding database with initial data...${NC}"
npm run seed

cd ..

echo -e "${GREEN}✅ Backend setup complete${NC}\n"

# Setup ML service
echo -e "${YELLOW}🤖 Setting up ML service...${NC}"
echo -e "${BLUE}   Note: ML dependencies will be installed when Docker container starts${NC}\n"

# Setup frontend
echo -e "${YELLOW}🎨 Setting up frontend...${NC}"
cd frontend
echo -e "${YELLOW}   Installing frontend dependencies...${NC}"
npm install > /dev/null 2>&1
cd ..

echo -e "${GREEN}✅ Frontend setup complete${NC}\n"

# Start all services
echo -e "${YELLOW}🚀 Starting all services...${NC}"
$DOCKER_COMPOSE up -d

echo -e "\n${GREEN}⏳ Waiting for all services to start...${NC}"
sleep 15

# Display status
echo -e "\n${BLUE}════════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}✨ Setup Complete!${NC}"
echo -e "${BLUE}════════════════════════════════════════════════════════════${NC}\n"

echo -e "${GREEN}🌐 Services are now running:${NC}"
echo -e "   ${BLUE}Frontend Dashboard:${NC}  http://localhost:5173"
echo -e "   ${BLUE}Backend API:${NC}         http://localhost:3000"
echo -e "   ${BLUE}ML Service:${NC}          http://localhost:8000"
echo -e "   ${BLUE}PostgreSQL:${NC}          localhost:5432"
echo -e "   ${BLUE}Redis:${NC}               localhost:6379\n"

echo -e "${GREEN}📚 Useful commands:${NC}"
echo -e "   ${BLUE}View logs:${NC}           docker-compose logs -f"
echo -e "   ${BLUE}Stop services:${NC}       docker-compose down"
echo -e "   ${BLUE}Restart services:${NC}    docker-compose restart"
echo -e "   ${BLUE}Database Studio:${NC}     cd backend && npx prisma studio\n"

echo -e "${GREEN}📊 Default stocks being tracked:${NC}"
echo -e "   ${BLUE}•${NC} Vår Energi AS (VAR.OL)"
echo -e "   ${BLUE}•${NC} DNB Bank ASA (DNB.OL)"
echo -e "   ${BLUE}•${NC} Storebrand ASA (STB.OL)\n"

echo -e "${YELLOW}⚠️  Important Notes:${NC}"
echo -e "   • The ML service may take a few minutes to download model dependencies"
echo -e "   • Stock data collection will start according to the configured schedule"
echo -e "   • News scraping begins automatically every 2 hours"
echo -e "   • Check logs if you encounter any issues: docker-compose logs -f\n"

echo -e "${BLUE}════════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}Happy investing! 📈${NC}"
echo -e "${BLUE}════════════════════════════════════════════════════════════${NC}\n"
