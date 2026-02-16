# Use Node.js 22 as base image to support npm beta
FROM node:22-slim

# Install system dependencies required for node-pty and other native modules
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    build-essential \
    git \
    curl \
    libpam0g-dev \
    && rm -rf /var/lib/apt/lists/*

# Install latest npm (11.5.2 as of August 2025)
RUN npm install -g npm@latest

# Set working directory
WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml ./
COPY node-pty/package.json ./node-pty/

# Install pnpm
RUN npm install -g pnpm@latest

# Copy all source code first (needed for postinstall scripts)
COPY . .

# Install dependencies
RUN pnpm install --frozen-lockfile

# Skip build for now - just test with source files
# RUN pnpm run build:npm

# Expose the default port
EXPOSE 4020

# Default command for testing
CMD ["pnpm", "run", "test:ci"]