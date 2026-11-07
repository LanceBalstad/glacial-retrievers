# Express API for Cloud Run. Build context is the server/ folder:
#   gcloud run deploy glacial-retrievers-api --source server ...
FROM node:22-slim

WORKDIR /app
ENV NODE_ENV=production

# Install production dependencies first so this layer is cached between deploys.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY src ./src

# Cloud Run sets PORT (8080); index.ts listens on process.env.PORT.
# Configuration comes from Cloud Run env vars / secrets, not .env files.
CMD ["node", "--import", "tsx", "src/index.ts"]
