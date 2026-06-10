FROM oven/bun:1-alpine
WORKDIR /app

# Install dependencies first (cached layer)
COPY package.json bun.lockb ./
RUN bun install

# Copy source
COPY . .

ENV NODE_ENV=development

EXPOSE 5173

# --host 0.0.0.0 required so Docker port-mapping reaches the container
CMD ["bun", "run", "dev", "--", "--host", "0.0.0.0", "--port", "5173"]
