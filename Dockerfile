FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json ./
# Runtime only needs prod deps (tsx lives in dependencies) — smaller image,
# smaller attack surface. Frontend build happens in CI, not in this image.
RUN npm ci --omit=dev

COPY server.ts ./
COPY src ./src

EXPOSE 8080

ENV NODE_ENV=production
CMD ["npx", "tsx", "server.ts"]
