# Multi-stage build for backend

# Base stage
FROM node:20-alpine AS base
WORKDIR /app

# Install dependencies for Puppeteer and Prisma
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-freefont \
    openssl \
    libc6-compat

# Tell Puppeteer to skip installing Chrome. We'll use the installed package.
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

# Development stage
FROM base AS development

# Copy package files
COPY package*.json ./

# Install all dependencies (including dev dependencies)
RUN npm install

# Copy Prisma schema first
COPY src/database/prisma ./src/database/prisma

# Generate Prisma client
RUN npx prisma generate --schema=./src/database/prisma/schema.prisma

# Copy source code
COPY . .

EXPOSE 3000

CMD ["npm", "run", "dev"]

# Build stage
FROM base AS builder

COPY package*.json ./
RUN npm ci --only=production

COPY src/database/prisma ./src/database/prisma
RUN npx prisma generate --schema=./src/database/prisma/schema.prisma

COPY . .
RUN npm run build

# Production stage
FROM base AS production

ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force

COPY src/database/prisma ./src/database/prisma
RUN npx prisma generate --schema=./src/database/prisma/schema.prisma

COPY --from=builder /app/dist ./dist

EXPOSE 3000

USER node

CMD ["node", "dist/app.js"]
