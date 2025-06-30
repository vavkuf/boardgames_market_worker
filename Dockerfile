FROM node:18-alpine

# Install unrar for RAR file support
RUN apk add --no-cache unrar

# Create app directory
WORKDIR /usr/src/app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy source code
COPY src/ ./src/
COPY scripts/ ./scripts/

# Create data directory
RUN mkdir -p ./data

# Create non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S worker -u 1001
RUN chown -R worker:nodejs /usr/src/app
USER worker

# Expose health check port (if needed in future)
EXPOSE 3000

# Start the worker
CMD ["npm", "start"] 