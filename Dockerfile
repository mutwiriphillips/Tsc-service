# One image: the web app is exported to static files and served by the API on the same port.
FROM node:22-slim AS web
WORKDIR /web
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
ENV NEXT_TELEMETRY_DISABLED=1 NEXT_PUBLIC_API_URL=""
RUN npm run build

FROM node:22-slim
RUN apt-get update && apt-get install -y --no-install-recommends openssl tini ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app/backend
COPY backend/package.json backend/package-lock.json ./
COPY backend/prisma ./prisma
COPY backend/prisma.config.ts ./
RUN npm ci --omit=dev && npm cache clean --force
COPY backend/src ./src
COPY backend/scripts ./scripts
COPY --from=web /web/out /app/frontend/out
RUN chown -R node:node /app
USER node
ENV NODE_ENV=production PORT=4000
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s CMD node -e "fetch('http://localhost:'+(process.env.PORT||4000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["/usr/bin/tini", "--"]
# Apply pending migrations, load reference data and the first admin if needed (both idempotent), then serve.
CMD ["sh", "-c", "npx prisma migrate deploy && node prisma/seed.js && node src/server.js"]
