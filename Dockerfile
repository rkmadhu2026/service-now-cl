FROM cgr.dev/chainguard/node:latest-dev AS build
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM cgr.dev/chainguard/node:latest-dev AS deps
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=4000

COPY package*.json ./
RUN npm ci --omit=dev

FROM cgr.dev/chainguard/node:latest AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=4000

COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/public ./public
COPY --from=build /app/prisma ./prisma

EXPOSE 4000

CMD ["dist/index.js"]
