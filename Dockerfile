# syntax=docker/dockerfile:1.7
ARG NODE_IMAGE=node:24-bookworm-slim@sha256:c86ecead9e55a5210ac1727de38a4ca840bf03dcaf34dc9749addbf383b1920c
FROM ${NODE_IMAGE} AS base
WORKDIR /app
RUN --mount=type=secret,id=proxy_ca \
    if [ -f /run/secrets/proxy_ca ]; then \
      apt-get -o Acquire::https::CaInfo=/run/secrets/proxy_ca update && \
      apt-get -o Acquire::https::CaInfo=/run/secrets/proxy_ca install -y --no-install-recommends ca-certificates openssl; \
    else \
      apt-get update && apt-get install -y --no-install-recommends ca-certificates openssl; \
    fi && rm -rf /var/lib/apt/lists/*

FROM base AS dependencies
COPY package.json package-lock.json ./
RUN --mount=type=secret,id=proxy_ca \
    if [ -f /run/secrets/proxy_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/proxy_ca; fi; \
    npm ci --no-fund --no-audit && npm cache clean --force

FROM dependencies AS build
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# Public build placeholders only. No runtime secrets or database access during build.
RUN --mount=type=secret,id=proxy_ca \
    if [ -f /run/secrets/proxy_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/proxy_ca; fi; \
    DATABASE_URL=postgresql://build:build@127.0.0.1:5432/build \
    BETTER_AUTH_SECRET=build-placeholder-not-a-runtime-secret-0000000000 \
    APP_URL=https://build.example.invalid npm run build

FROM dependencies AS tools
COPY . .
RUN --mount=type=secret,id=proxy_ca \
    if [ -f /run/secrets/proxy_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/proxy_ca; fi; \
    npm run db:generate && chmod -R a+rX /app
USER node
ENV NODE_ENV=production
ENTRYPOINT ["node", "docker/entrypoint.mjs"]
CMD ["migrate"]

FROM base AS runner
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --chown=node:node docker/entrypoint.mjs ./docker/entrypoint.mjs
RUN chmod -R a+rX /app
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["node", "docker/entrypoint.mjs"]
CMD ["serve"]
