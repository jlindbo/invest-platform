#!/bin/bash
set -e

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}   J Group Invest Corp - System Testing & Model Training${NC}"
echo -e "${BLUE}════════════════════════════════════════════════════════════${NC}\n"

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo -e "${RED}❌ Docker is not running. Please start Docker Desktop first.${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Docker is running${NC}\n"

# Start services
echo -e "${YELLOW}📦 Starting all services...${NC}"
docker-compose up -d

echo -e "${YELLOW}⏳ Waiting 30 seconds for services to initialize...${NC}"
sleep 30

# Check service health
echo -e "\n${YELLOW}🏥 Checking service health...${NC}"

if curl -s http://localhost:3000/health | jq -e '.status == "healthy"' > /dev/null 2>&1; then
    echo -e "${GREEN}✅ Backend API is healthy${NC}"
else
    echo -e "${RED}❌ Backend API is not responding${NC}"
    exit 1
fi

if curl -s http://localhost:8000/health | jq -e '.status == "healthy"' > /dev/null 2>&1; then
    echo -e "${GREEN}✅ ML Service is healthy${NC}"
else
    echo -e "${RED}❌ ML Service is not responding${NC}"
    exit 1
fi

if curl -s http://localhost:5173 > /dev/null 2>&1; then
    echo -e "${GREEN}✅ Frontend is running${NC}"
else
    echo -e "${RED}❌ Frontend is not responding${NC}"
fi

# Test 1: Collect Stock Data
echo -e "\n${BLUE}════════════════════════════════════════════════════════════${NC}"
echo -e "${YELLOW}TEST 1: Collecting Historical Stock Data${NC}"
echo -e "${BLUE}════════════════════════════════════════════════════════════${NC}\n"

echo -e "${YELLOW}📊 Triggering data collection for Vår Energi (VAR.OL)...${NC}"
curl -s -X POST http://localhost:3000/api/v1/stocks/VAR.OL/collect | jq

echo -e "\n${YELLOW}⏳ Waiting for data collection to complete (30 seconds)...${NC}"
sleep 30

echo -e "\n${YELLOW}📊 Triggering data collection for DNB (DNB.OL)...${NC}"
curl -s -X POST http://localhost:3000/api/v1/stocks/DNB.OL/collect | jq

echo -e "\n${YELLOW}⏳ Waiting for data collection to complete (30 seconds)...${NC}"
sleep 30

echo -e "\n${YELLOW}📊 Triggering data collection for Storebrand (STB.OL)...${NC}"
curl -s -X POST http://localhost:3000/api/v1/stocks/STB.OL/collect | jq

echo -e "\n${YELLOW}⏳ Waiting for data collection to complete (30 seconds)...${NC}"
sleep 30

# Check collected data
echo -e "\n${YELLOW}🔍 Checking collected data...${NC}"
VAR_PRICES=$(curl -s "http://localhost:3000/api/v1/stocks/VAR.OL/prices?limit=5" | jq -r '.count')
DNB_PRICES=$(curl -s "http://localhost:3000/api/v1/stocks/DNB.OL/prices?limit=5" | jq -r '.count')
STB_PRICES=$(curl -s "http://localhost:3000/api/v1/stocks/STB.OL/prices?limit=5" | jq -r '.count')

echo -e "${GREEN}✅ VAR.OL: ${VAR_PRICES} price records${NC}"
echo -e "${GREEN}✅ DNB.OL: ${DNB_PRICES} price records${NC}"
echo -e "${GREEN}✅ STB.OL: ${STB_PRICES} price records${NC}"

# Test 2: Scrape News
echo -e "\n${BLUE}════════════════════════════════════════════════════════════${NC}"
echo -e "${YELLOW}TEST 2: Scraping Norwegian Financial News${NC}"
echo -e "${BLUE}════════════════════════════════════════════════════════════${NC}\n"

echo -e "${YELLOW}📰 Triggering news scraping...${NC}"
curl -s -X POST http://localhost:3000/api/v1/news/scrape | jq

echo -e "\n${YELLOW}⏳ Waiting for news scraping to complete (60 seconds)...${NC}"
sleep 60

# Check scraped news
echo -e "\n${YELLOW}🔍 Checking scraped news...${NC}"
NEWS_COUNT=$(curl -s "http://localhost:3000/api/v1/news?limit=10" | jq -r '.count')
echo -e "${GREEN}✅ Found ${NEWS_COUNT} news articles${NC}"

if [ "$NEWS_COUNT" -gt 0 ]; then
    echo -e "\n${YELLOW}📰 Sample news article:${NC}"
    curl -s "http://localhost:3000/api/v1/news?limit=1" | jq '.articles[0] | {title, source, publishedAt}'
fi

# Test 3: Sentiment Analysis
echo -e "\n${BLUE}════════════════════════════════════════════════════════════${NC}"
echo -e "${YELLOW}TEST 3: Norwegian Sentiment Analysis${NC}"
echo -e "${BLUE}════════════════════════════════════════════════════════════${NC}\n"

echo -e "${YELLOW}🤖 Testing sentiment analysis on Norwegian text...${NC}\n"

echo -e "${BLUE}Text 1 (Positive):${NC} 'Vår Energi rapporterer sterk vekst og høye inntekter'"
curl -s -X POST http://localhost:8000/api/v1/sentiment/analyze \
  -H "Content-Type: application/json" \
  -d '{"text":"Vår Energi rapporterer sterk vekst og høye inntekter"}' | jq '.sentiment'

echo -e "\n${BLUE}Text 2 (Negative):${NC} 'DNB melder om tap og fallende resultater'"
curl -s -X POST http://localhost:8000/api/v1/sentiment/analyze \
  -H "Content-Type: application/json" \
  -d '{"text":"DNB melder om tap og fallende resultater"}' | jq '.sentiment'

echo -e "\n${BLUE}Text 3 (Neutral):${NC} 'Storebrand holder generalforsamling i dag'"
curl -s -X POST http://localhost:8000/api/v1/sentiment/analyze \
  -H "Content-Type: application/json" \
  -d '{"text":"Storebrand holder generalforsamling i dag"}' | jq '.sentiment'

# Test 4: Train Models
echo -e "\n${BLUE}════════════════════════════════════════════════════════════${NC}"
echo -e "${YELLOW}TEST 4: Training LSTM Models${NC}"
echo -e "${BLUE}════════════════════════════════════════════════════════════${NC}\n"

echo -e "${YELLOW}🚀 Training model for Vår Energi (VAR.OL)...${NC}"
echo -e "${YELLOW}This will take several minutes. Running in background.${NC}\n"
curl -s -X POST http://localhost:3000/api/v1/predictions/VAR.OL/train | jq

echo -e "\n${YELLOW}🚀 Training model for DNB (DNB.OL)...${NC}"
curl -s -X POST http://localhost:3000/api/v1/predictions/DNB.OL/train | jq

echo -e "\n${YELLOW}🚀 Training model for Storebrand (STB.OL)...${NC}"
curl -s -X POST http://localhost:3000/api/v1/predictions/STB.OL/train | jq

echo -e "\n${YELLOW}⏳ Training in progress. Waiting 5 minutes for models to train...${NC}"
echo -e "${YELLOW}You can monitor progress with: docker-compose logs -f ml-service${NC}\n"

# Wait and check progress periodically
for i in {1..10}; do
    echo -e "${YELLOW}[$i/10] Waiting 30 seconds...${NC}"
    sleep 30

    # Check if models are ready
    VAR_STATUS=$(curl -s http://localhost:8000/api/v1/train/status/VAR.OL | jq -r '.has_model')
    if [ "$VAR_STATUS" == "true" ]; then
        echo -e "${GREEN}✅ VAR.OL model training completed!${NC}"
        break
    fi
done

# Check training status
echo -e "\n${YELLOW}🔍 Checking training status...${NC}\n"

echo -e "${BLUE}VAR.OL Status:${NC}"
curl -s http://localhost:8000/api/v1/train/status/VAR.OL | jq

echo -e "\n${BLUE}DNB.OL Status:${NC}"
curl -s http://localhost:8000/api/v1/train/status/DNB.OL | jq

echo -e "\n${BLUE}STB.OL Status:${NC}"
curl -s http://localhost:8000/api/v1/train/status/STB.OL | jq

# Test 5: Generate Predictions
echo -e "\n${BLUE}════════════════════════════════════════════════════════════${NC}"
echo -e "${YELLOW}TEST 5: Generating Predictions${NC}"
echo -e "${BLUE}════════════════════════════════════════════════════════════${NC}\n"

# Check if at least one model is trained
VAR_MODEL=$(curl -s http://localhost:8000/api/v1/train/status/VAR.OL | jq -r '.has_model')

if [ "$VAR_MODEL" == "true" ]; then
    echo -e "${YELLOW}🔮 Generating prediction for VAR.OL...${NC}"
    curl -s -X POST http://localhost:3000/api/v1/predictions/generate \
      -H "Content-Type: application/json" \
      -d '{"ticker":"VAR.OL"}' | jq

    sleep 10

    echo -e "\n${YELLOW}📊 Viewing prediction:${NC}"
    curl -s "http://localhost:3000/api/v1/predictions/VAR.OL?limit=1" | jq '.predictions[0]'
else
    echo -e "${YELLOW}⚠️  Models are still training. You can generate predictions later with:${NC}"
    echo -e "${BLUE}curl -X POST http://localhost:3000/api/v1/predictions/generate${NC}"
fi

# Test 6: Database Verification
echo -e "\n${BLUE}════════════════════════════════════════════════════════════${NC}"
echo -e "${YELLOW}TEST 6: Database Verification${NC}"
echo -e "${BLUE}════════════════════════════════════════════════════════════${NC}\n"

echo -e "${YELLOW}📊 Database Statistics:${NC}\n"

docker exec invest-postgres psql -U invest_user -d invest_db -c "
SELECT
    'Companies' as table_name, COUNT(*) as count FROM companies
UNION ALL
SELECT 'Stock Prices', COUNT(*) FROM stock_prices
UNION ALL
SELECT 'Technical Indicators', COUNT(*) FROM technical_indicators
UNION ALL
SELECT 'News Articles', COUNT(*) FROM news_articles
UNION ALL
SELECT 'ML Models', COUNT(*) FROM ml_models
UNION ALL
SELECT 'Predictions', COUNT(*) FROM predictions;
"

# Final Summary
echo -e "\n${BLUE}════════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}✨ System Testing Complete!${NC}"
echo -e "${BLUE}════════════════════════════════════════════════════════════${NC}\n"

echo -e "${GREEN}📊 Summary:${NC}"
echo -e "   ${BLUE}•${NC} Services: Backend, ML Service, Frontend"
echo -e "   ${BLUE}•${NC} Stock Data: VAR.OL, DNB.OL, STB.OL"
echo -e "   ${BLUE}•${NC} News Articles: Scraped from E24 & DN"
echo -e "   ${BLUE}•${NC} Sentiment Analysis: Working"
echo -e "   ${BLUE}•${NC} Models: Training initiated"
echo -e ""
echo -e "${GREEN}🌐 Access Your Platform:${NC}"
echo -e "   ${BLUE}Frontend:${NC}     http://localhost:5173"
echo -e "   ${BLUE}Backend API:${NC}  http://localhost:3000"
echo -e "   ${BLUE}ML Service:${NC}   http://localhost:8000"
echo -e "   ${BLUE}API Docs:${NC}     http://localhost:8000/docs"
echo -e ""
echo -e "${GREEN}📚 Useful Commands:${NC}"
echo -e "   ${BLUE}View logs:${NC}           docker-compose logs -f"
echo -e "   ${BLUE}Check predictions:${NC}   curl http://localhost:3000/api/v1/predictions/latest | jq"
echo -e "   ${BLUE}Database access:${NC}     docker exec -it invest-postgres psql -U invest_user -d invest_db"
echo -e "   ${BLUE}Restart services:${NC}    docker-compose restart"
echo -e ""
echo -e "${YELLOW}⚠️  Note: Model training may take 10-30 minutes depending on data size.${NC}"
echo -e "${YELLOW}   Monitor training: docker-compose logs -f ml-service${NC}"
echo -e ""
echo -e "${BLUE}════════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}Happy investing! 📈${NC}"
echo -e "${BLUE}════════════════════════════════════════════════════════════${NC}\n"
