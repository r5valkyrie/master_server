# Multi-stage Dockerfile for R5Valkyrie Master Server
# Stage 1: Build
FROM node:22-alpine AS builder

# Install build dependencies
RUN apk add --no-cache python3 make g++ openssl

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy source code and configuration
COPY . .

# Generate RSA keys if they don't exist
RUN if [ ! -f auth.key ]; then \
        echo "Generating RSA keys for JWT authentication..." && \
        openssl genrsa -out auth.key 2048 && \
        openssl rsa -in auth.key -pubout -out auth.key.pub; \
    fi

# Build the application
RUN npm run build

# Stage 2: Production
FROM node:22-alpine AS production

# Install runtime dependencies
RUN apk add --no-cache openssl mysql-client

WORKDIR /app

# Copy package files and install production dependencies only
COPY package*.json ./
RUN npm ci --omit=dev

# Copy built application from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/auth.key ./auth.key
COPY --from=builder /app/auth.key.pub ./auth.key.pub

# Copy necessary runtime files
COPY schema.sql ./schema.sql

# Create a non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 && \
    chown -R nodejs:nodejs /app

USER nodejs

# Expose the application port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Start the application
# Note: We use node directly instead of npm start because docker-compose
# provides environment variables, so we don't need dotenv-cli
CMD ["node", "dist/server/entry.mjs"]

