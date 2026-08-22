# ---- Étape 1 : dépendances ----
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# ---- Étape 2 : runner (image finale minimale) ----
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

# Utilisateur non-root (sécurité)
RUN addgroup -S ecoscol && adduser -S ecoscol -G ecoscol

COPY --from=deps /app/node_modules ./node_modules
COPY src ./src
COPY migrations ./migrations
COPY scripts ./scripts
COPY package.json ./

# Dossiers de données (en prod : volumes persistants ou stockage objet type S3)
RUN mkdir -p uploads documents && chown -R ecoscol:ecoscol uploads documents
USER ecoscol

EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:4000/api/health || exit 1

CMD ["node", "src/server.js"]
