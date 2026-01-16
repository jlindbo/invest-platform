# J Group Invest - Norwegian Stock Market Prediction Platform

A full-stack application for tracking and predicting Norwegian stock prices on Oslo Børs using machine learning.

## Features

- 📊 **Live Stock Tracking**: Real-time price monitoring for Norwegian stocks (Oslo Børs)
- 🤖 **ML Predictions**: LSTM-based price predictions with confidence scores
- 📈 **Live Comparison Dashboard**: Compare actual vs predicted prices in real-time
- 🎨 **Enhanced Visualizations**: 
  - Color-coded error indicators (green/yellow/red)
  - Price sparkline charts
  - Confidence progress bars
  - Market status badges
- ⚡ **Smart Polling**: Adaptive update intervals (2 min during trading hours, 30 min after hours)
- 📰 **News Scraping**: Automated collection from Norwegian financial news sources
- 🔔 **Alerts**: Notification system for investment opportunities
- 📊 **Analytics**: Historical performance tracking and backtesting

## Tech Stack

### Frontend
- React 18 + TypeScript
- Vite
- TanStack Query (React Query)
- Recharts for visualizations
- Tailwind CSS
- Axios

### Backend
- Node.js 20 + TypeScript
- Express.js
- Prisma ORM (PostgreSQL)
- Redis (caching + Bull queues)
- Bull (job scheduling)
- Winston (logging)
- Cheerio + Puppeteer (web scraping)
- Yahoo Finance API

### Infrastructure
- **Frontend**: Vercel
- **Backend**: Heroku
- **Database**: PostgreSQL (Heroku Postgres)
- **Cache/Queue**: Redis (Heroku Redis)
- **CI/CD**: GitHub Actions

## Project Structure

```
invest/
├── backend/                 # Node.js API server
│   ├── src/
│   │   ├── api/            # Express routes
│   │   ├── config/         # Configuration files
│   │   ├── database/       # Prisma schema & migrations
│   │   ├── jobs/           # Bull queue jobs
│   │   ├── services/       # Business logic
│   │   ├── utils/          # Helper functions
│   │   └── app.ts          # Entry point
│   ├── Procfile            # Heroku process configuration
│   ├── runtime.txt         # Node.js version
│   └── package.json
│
├── frontend/               # React application
│   ├── src/
│   │   ├── components/     # React components
│   │   ├── services/       # API client
│   │   ├── types/          # TypeScript types
│   │   └── App.tsx         # Root component
│   ├── vercel.json         # Vercel configuration
│   └── package.json
│
├── .github/
│   └── workflows/          # CI/CD pipelines
│       ├── backend-deploy.yml
│       └── frontend-deploy.yml
│
├── DEPLOYMENT.md           # Deployment guide
└── README.md              # This file
```

## Target Stocks

- **VAR.OL** - Vår Energi AS (Energy)
- **DNB.OL** - DNB Bank ASA (Financial Services)
- **STB.OL** - Storebrand ASA (Insurance)

## Getting Started

### Prerequisites

- Node.js >= 20.0.0
- PostgreSQL >= 14
- Redis >= 6.0
- npm >= 10.0.0

### Local Development

#### 1. Clone the repository

```bash
git clone https://github.com/YOUR_USERNAME/YOUR_REPO.git
cd invest
```

#### 2. Setup Backend

```bash
cd backend
npm install

# Copy environment template
cp .env.example .env

# Update .env with your credentials:
# DATABASE_URL=postgresql://invest_user:changeme@localhost:5432/invest_db
# REDIS_URL=redis://localhost:6379
# REDIS_PASSWORD=

# Create database
createdb invest_db
createuser invest_user

# Run migrations
npx prisma db push --schema=src/database/prisma/schema.prisma

# Seed database
npm run seed

# Start development server
npm run dev
```

Backend will run on `http://localhost:3000`

#### 3. Setup Frontend

```bash
cd frontend
npm install

# Create .env file
echo "VITE_API_URL=http://localhost:3000" > .env

# Start development server
npm run dev
```

Frontend will run on `http://localhost:5173`

### Fetch Initial Data

Run these scripts to populate the database:

```bash
cd backend

# Fetch stock prices (last 7 days)
npx tsx src/scripts/manual-fetch-prices.ts

# Create mock predictions for testing
npx tsx src/scripts/create-mock-predictions.ts
```

## Key Endpoints

### Backend API

- `GET /health` - Health check
- `GET /api/v1/live/comparison` - Live actual vs predicted comparison
- `GET /api/v1/live/prices` - Current stock prices
- `GET /api/v1/stocks` - All tracked stocks
- `GET /api/v1/predictions` - ML predictions
- `GET /api/v1/news` - Financial news articles
- `GET /api/v1/analytics` - Performance analytics

## Background Jobs

The backend runs scheduled jobs using Bull queues:

- **Daily Price Collection**: 4:00 PM CET (Mon-Fri)
- **Intraday Collection**: Every 2 minutes during trading hours (9:00 AM - 4:20 PM CET)
- **News Scraping**: Every 2 hours
- **Prediction Generation**: 6:00 AM daily (Mon-Fri)
- **Opportunity Scan**: Every 30 minutes

## Live Dashboard Features

### Market Status Badge
- **Green with pulse animation**: Market open
- **Gray**: Market closed
- Shows next market open time

### Error Indicators
- **Green badge (<2% error)**: Excellent prediction
- **Yellow badge (2-5% error)**: Good prediction
- **Red badge (>5% error)**: Poor prediction

### Price Sparklines
- Last 5 trading days
- Visual trend indicator
- Hover for details

### Smart Polling
- **2 minutes**: During Oslo Børs trading hours (9:00 AM - 4:20 PM CET)
- **30 minutes**: Outside trading hours
- Automatic market status detection

## Deployment

See [DEPLOYMENT.md](./DEPLOYMENT.md) for detailed instructions on deploying to production.

Quick summary:

```bash
# 1. Push to GitHub
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
git push -u origin main

# 2. Deploy Backend to Heroku
heroku create your-app-name
heroku addons:create heroku-postgresql:essential-0
heroku addons:create heroku-redis:hobby-dev
git subtree push --prefix backend heroku main

# 3. Deploy Frontend to Vercel
cd frontend
vercel --prod
```

## Environment Variables

### Backend

```env
NODE_ENV=production
DATABASE_URL=postgresql://...  # Auto-set by Heroku Postgres
REDIS_URL=redis://...          # Auto-set by Heroku Redis
REDIS_PASSWORD=                # Empty for Heroku Redis
CORS_ORIGIN=https://your-app.vercel.app
```

### Frontend

```env
VITE_API_URL=https://your-app.herokuapp.com
```

## Testing

```bash
# Backend
cd backend
npm test

# Frontend
cd frontend
npm test
```

## Monitoring

### Heroku Dashboard
- View application metrics
- Monitor dyno usage
- Check PostgreSQL/Redis performance

### Logs
```bash
# Backend logs
heroku logs --tail

# Frontend logs (Vercel dashboard)
```

## Oslo Børs Market Hours

- **Trading Hours**: 9:00 AM - 4:20 PM CET (Mon-Fri)
- **Timezone**: Europe/Oslo
- **Holidays**: Norwegian market holidays (hardcoded in config)

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

MIT License - see LICENSE file for details

## Author

J Group Invest Corp

## Disclaimer

This application is for educational purposes only. Not financial advice. Always do your own research before making investment decisions.

