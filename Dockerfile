FROM node:22-slim

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@9.12.0 --activate
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 python3-opencv \
  && rm -rf /var/lib/apt/lists/*

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm build

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

CMD ["node", "dist/index.js"]
