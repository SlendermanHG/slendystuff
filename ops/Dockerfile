# syntax=docker/dockerfile:1.7

FROM node:22-bookworm-slim AS deps
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

FROM node:22-bookworm-slim AS runtime
WORKDIR /app

ENV NODE_ENV=production

COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json server.js ./
COPY public ./public
COPY scripts ./scripts

RUN mkdir -p /srv/websitemanbot/persist/data /srv/websitemanbot/persist/logs \
  && chown -R node:node /app /srv/websitemanbot

USER node

EXPOSE 4173

CMD ["node", "server.js"]
