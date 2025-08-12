FROM node:22.12.0-bookworm

# System deps required to build/run node-canvas
RUN apt-get update && apt-get install -y \
  python3 make g++ \
  libcairo2-dev libpango1.0-dev libjpeg-dev libgif-dev librsvg2-dev \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install deps with lockfile for reproducibility
COPY package.json package-lock.json ./
RUN npm ci

# Add sources and build TypeScript
COPY . .

# Set runtime env (set after build so devDeps were available)
ENV NODE_ENV=production
