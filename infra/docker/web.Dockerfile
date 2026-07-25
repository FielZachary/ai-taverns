FROM node:22-alpine AS base

WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

COPY package.json package-lock.json ./
COPY apps ./apps
COPY assets ./assets
COPY packages ./packages

RUN npm ci
RUN npm run build -w @ai-dnd/domain \
  && npm run build -w @ai-dnd/contracts \
  && npm run build -w @ai-dnd/dm \
  && npm run build -w @ai-dnd/db \
  && npm run build -w @ai-dnd/web
RUN npm prune --omit=dev

ENV NODE_ENV=production

EXPOSE 3000

CMD ["npm", "run", "start", "-w", "@ai-dnd/web", "--", "-H", "0.0.0.0"]
