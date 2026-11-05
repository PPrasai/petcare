# Production images for petcare.pprasai.io. Build context: the repository root.
#   docker build -f deploy/Dockerfile --target api -t petcare-api .
#   docker build -f deploy/Dockerfile --target web -t petcare-web .

# --- build: install the workspace and build the web app ---
FROM node:24-slim AS build
ENV CI=true
RUN npm install -g pnpm@9.15.9
WORKDIR /app
# Download packages using only the lockfile, so this layer is cached until dependencies change.
COPY pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
RUN pnpm fetch
COPY . .
RUN pnpm install --frozen-lockfile --offline
RUN pnpm --filter @petcare/web build

# --- api: Node runs the TypeScript sources through tsx ---
FROM node:24-slim AS api
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /app /app
# A new named volume copies this directory's owner, so the API (user node) can write uploads.
RUN mkdir -p /data/files && chown node:node /data/files
USER node
EXPOSE 3000
CMD ["node", "--import", "tsx", "apps/api/src/main.ts"]

# --- web: Caddy serves the built PWA and forwards /api and /cal to the API ---
FROM caddy:2-alpine AS web
COPY deploy/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/apps/web/dist /srv
