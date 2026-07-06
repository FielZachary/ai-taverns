FROM node:22-alpine AS base

WORKDIR /app

COPY package.json package-lock.json ./
COPY apps ./apps
COPY packages ./packages
COPY scripts ./scripts
COPY infra/db ./infra/db

RUN npm ci
RUN npm run build:api
RUN npm prune --omit=dev

ENV NODE_ENV=production

EXPOSE 4000

CMD ["npm", "run", "start", "-w", "@ai-dnd/api"]
