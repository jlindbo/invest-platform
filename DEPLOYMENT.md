# Deployment Guide

This guide covers deploying the J Group Invest application to production using Vercel (frontend) and Heroku (backend).

## Prerequisites

- GitHub account
- Vercel account
- Heroku account
- Heroku CLI installed (`brew install heroku/brew/heroku`)

## Architecture

- **Frontend**: React + Vite → Vercel
- **Backend**: Node.js + Express → Heroku
- **Database**: PostgreSQL → Heroku Postgres addon
- **Cache/Queue**: Redis → Heroku Redis addon

---

## 1. Push to GitHub

```bash
# Create a new repository on GitHub (https://github.com/new)
# Then run:

git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git
git add .
git commit -m "Initial commit: Norwegian stock prediction platform"
git push -u origin main
```

---

## 2. Deploy Backend to Heroku

### Create Heroku App

```bash
# Login to Heroku
heroku login

# Create app (replace with your app name)
heroku create your-app-name

# Add PostgreSQL addon (Hobby Dev - free tier)
heroku addons:create heroku-postgresql:essential-0

# Add Redis addon (Hobby Dev - free tier)
heroku addons:create heroku-redis:hobby-dev

# Set Node.js version
heroku config:set NODE_ENV=production

# Set CORS origin (update after deploying frontend)
heroku config:set CORS_ORIGIN=https://your-frontend-app.vercel.app

# Optional: Set other environment variables
heroku config:set LOG_LEVEL=info
heroku config:set REDIS_PASSWORD=""
```

### Deploy

```bash
# Deploy backend
git subtree push --prefix backend heroku main

# Or if using Heroku Git
cd backend
heroku git:remote -a your-app-name
git push heroku main
```

### Run Database Migrations & Seed

```bash
# Migrations run automatically via Procfile release command
# But you can also run manually:
heroku run "npx prisma migrate deploy --schema=src/database/prisma/schema.prisma"
heroku run "npx tsx src/database/seeds/seed.ts"
```

### View Logs

```bash
heroku logs --tail
```

---

## 3. Deploy Frontend to Vercel

### Option A: Vercel Dashboard (Recommended)

1. Go to [vercel.com](https://vercel.com)
2. Click "Add New" → "Project"
3. Import your GitHub repository
4. Configure build settings:
   - **Framework Preset**: Vite
   - **Root Directory**: `frontend`
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
5. Add environment variables:
   - `VITE_API_URL`: `https://your-app-name.herokuapp.com`
6. Click "Deploy"

### Option B: Vercel CLI

```bash
# Install Vercel CLI
npm install -g vercel

# Login
vercel login

# Deploy from frontend directory
cd frontend
vercel --prod

# Set environment variable
vercel env add VITE_API_URL production
# Enter: https://your-app-name.herokuapp.com
```

---

## 4. Configure GitHub Actions CI/CD

### Set GitHub Secrets

Go to your GitHub repository → Settings → Secrets and variables → Actions

Add the following secrets:

**Backend (Heroku):**
- `HEROKU_API_KEY`: Get from Heroku dashboard → Account Settings → API Key
- `HEROKU_APP_NAME`: Your Heroku app name
- `HEROKU_EMAIL`: Your Heroku account email

**Frontend (Vercel):**
- `VERCEL_TOKEN`: Get from Vercel → Settings → Tokens
- `VERCEL_ORG_ID`: Run `vercel whoami` to get organization ID
- `VERCEL_PROJECT_ID`: Run `vercel inspect` from frontend directory
- `VITE_API_URL`: Your Heroku backend URL

---

## 5. Update CORS Configuration

After deploying frontend, update backend CORS:

```bash
heroku config:set CORS_ORIGIN=https://your-frontend-app.vercel.app
```

---

## 6. Monitor & Scale

### View Heroku Metrics

```bash
heroku ps
heroku logs --tail
heroku pg:info
heroku redis:info
```

### Scale Dynos (if needed)

```bash
# Scale web dyno
heroku ps:scale web=1

# Upgrade to hobby tier ($7/month - never sleeps)
heroku dyno:resize hobby
```

### Database Backups

```bash
# Create manual backup
heroku pg:backups:capture

# View backups
heroku pg:backups
```

---

## 7. Environment Variables Reference

### Backend (Heroku)

Auto-configured by addons:
- `DATABASE_URL` - Set by Heroku Postgres
- `REDIS_URL` - Set by Heroku Redis

Manual configuration:
- `NODE_ENV=production`
- `PORT=3000` (set by Heroku)
- `CORS_ORIGIN=https://your-frontend-app.vercel.app`
- `REDIS_PASSWORD=` (empty for Heroku Redis)
- `LOG_LEVEL=info`

### Frontend (Vercel)

- `VITE_API_URL=https://your-app-name.herokuapp.com`

---

## 8. Troubleshooting

### Backend Issues

```bash
# Check logs
heroku logs --tail

# Check environment variables
heroku config

# Check database connection
heroku pg:credentials:url

# Restart app
heroku restart

# Run bash console
heroku run bash
```

### Frontend Issues

```bash
# Check Vercel deployment logs
vercel logs

# Redeploy
vercel --prod --force
```

### Database Migration Issues

```bash
# Reset database (CAUTION: deletes all data)
heroku pg:reset DATABASE_URL
heroku run "npx prisma migrate deploy --schema=src/database/prisma/schema.prisma"
heroku run "npx tsx src/database/seeds/seed.ts"
```

---

## 9. Cost Breakdown

### Free Tier

- **Heroku**: 
  - Essential-0 Postgres: Free (10,000 rows limit)
  - Hobby Dev Redis: Free (25 MB)
  - Eco Dyno: $5/month (sleeps after 30 min inactivity)
- **Vercel**: Free (100 GB bandwidth, unlimited deployments)

### Production Tier (Recommended)

- **Heroku**:
  - Mini Postgres: $5/month (10 million rows)
  - Premium-0 Redis: $15/month (100 MB)
  - Basic Dyno: $7/month (never sleeps)
  - **Total: ~$27/month**
- **Vercel**: Free tier is sufficient

---

## 10. Custom Domain (Optional)

### Vercel (Frontend)

1. Go to project settings → Domains
2. Add your custom domain
3. Configure DNS records as shown

### Heroku (Backend)

```bash
heroku domains:add api.yourdomain.com
# Configure DNS CNAME record to point to Heroku DNS target
```

---

## Support

For issues, check:
- Backend logs: `heroku logs --tail`
- Frontend logs: Vercel dashboard → Deployments → Logs
- Database status: `heroku pg:info`
- Redis status: `heroku redis:info`

