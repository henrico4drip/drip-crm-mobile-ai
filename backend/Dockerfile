FROM node:18-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./

RUN npm install --production

FROM ghcr.io/puppeteer/puppeteer:latest AS venom-deps

FROM node:18-alpine AS production

WORKDIR /app

# Copy Node.js dependencies from builder stage
COPY --from=builder /app/node_modules ./node_modules

# Copy application source code from the backend directory
COPY . ./

# Copy Chrome and its dependencies from venom-deps stage
COPY --from=venom-deps /usr/bin/google-chrome /usr/bin/google-chrome
COPY --from=venom-deps /usr/lib/chromium/ /usr/lib/chromium/
COPY --from=venom-deps /etc/fonts/ /etc/fonts/

# Create tokens directory for persistence
RUN mkdir -p tokens

# Expose port (assuming 3000, adjust if necessary)
EXPOSE 3000

CMD ["node", "app.js"]


