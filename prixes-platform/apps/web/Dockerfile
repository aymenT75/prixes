FROM node:22-alpine AS deps
WORKDIR /app
# The lockfile comes too: `npm install` from package.json alone re-resolves the
# tree on every build, so production could ship versions nobody tested — and it
# is what failed here ("Cannot read properties of null (reading 'edgesOut')").
# `npm ci` installs exactly what the lockfile pins, and is faster.
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS builder
WORKDIR /app
# NEXT_PUBLIC_* vars are inlined into the client bundle at build time, so the
# API URL the browser calls must be supplied here (the host-published API port).
# If not provided, defaults to relative path /api/v1 (proxied by host)
ARG NEXT_PUBLIC_API_BASE_URL=""
ENV NEXT_PUBLIC_API_BASE_URL=$NEXT_PUBLIC_API_BASE_URL
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
# Docker sets HOSTNAME to the container id, and the standalone server binds to
# whatever HOSTNAME says — without this it listens on an address Caddy cannot
# reach, and the site answers 502 while the container reports itself healthy.
ENV HOSTNAME=0.0.0.0
# `output: "standalone"` traces exactly what the server imports. Copying the
# whole node_modules here instead made this image 2.66 GB.
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
EXPOSE 3000
CMD ["node", "server.js"]
