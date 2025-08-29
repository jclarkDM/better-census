FROM oven/bun:latest
WORKDIR /app

# Curl & Unzip
RUN apt-get update && apt-get install -y curl && rm -rf /var/lib/apt/lists/*
RUN apt-get update && apt-get install -y unzip && rm -rf /var/lib/apt/lists/*

# Transfer App
COPY package.json bun.lock ./
RUN bun i
COPY . .

# Start Server
CMD ["sh", "-c", "bun run data urls && bun run server"]