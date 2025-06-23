FROM node:18-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./

RUN npm install --production

FROM node:18-alpine AS production

WORKDIR /app

COPY --from=builder /app/node_modules ./node_modules
COPY . ./

RUN mkdir -p tokens

EXPOSE 3000

CMD ["node", "app.js"]