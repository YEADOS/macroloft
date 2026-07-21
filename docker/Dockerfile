FROM oven/bun:1.3-slim AS build
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY tsconfig.json vite.config.ts drizzle.config.ts ./
COPY src ./src
COPY drizzle ./drizzle
COPY scripts ./scripts
RUN bun run build

FROM oven/bun:1.3-slim
WORKDIR /app
ENV NODE_ENV=production DB_PATH=/data/macroloft.db PORT=3000
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/src ./src
COPY --from=build /app/drizzle ./drizzle
COPY --from=build /app/scripts ./scripts
COPY --from=build /app/package.json ./
VOLUME /data
# uid 1000, matching the host user that owns ./data — keeps files the container
# creates writable by host-side imports (bun run import:afcd et al).
USER bun
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s CMD bun -e "fetch('http://localhost:3000/healthz').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["bun", "run", "src/server/index.ts"]
