FROM node:22.12.0-bookworm

# Avoid interactive prompts during package installs
ENV DEBIAN_FRONTEND=noninteractive

# Common CLI and build tooling. Add more tools here later as needed.
RUN apt-get update && apt-get install -y \
    curl ca-certificates git bash-completion \
    python3 python-is-python3 python3-pip make g++ \
    ffmpeg \
    libcairo2-dev libpango1.0-dev libjpeg-dev libgif-dev librsvg2-dev \
    && rm -rf /var/lib/apt/lists/*

# Install youtube-dl via pip (preferred for stability)
RUN wget https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -O /usr/local/bin/yt-dlp \
    && chmod a+rx /usr/local/bin/yt-dlp \
    && yt-dlp --version || echo "yt-dlp not installed"

# Working directory inside the container for dev
WORKDIR /app

# Default environment for devcontainer
ENV NODE_ENV=development


