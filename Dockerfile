FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY ["whatsapp-Kairos (final)/whatsapp-Kairos/whatsapp-new/package.json", "./"]
COPY ["whatsapp-Kairos (final)/whatsapp-Kairos/whatsapp-new/backend/package.json", "whatsapp-Kairos (final)/whatsapp-Kairos/whatsapp-new/backend/package-lock.json", "./backend/"]

# Install backend dependencies
RUN npm install --prefix backend --omit=dev

# Copy application source files
COPY ["whatsapp-Kairos (final)/whatsapp-Kairos/whatsapp-new/", "./"]

# Expose port (Render sets PORT=10000 by default)
EXPOSE 10000

ENV NODE_ENV=production
ENV PORT=10000

# Start WhatsApp Bot & DRM Server
CMD ["node", "backend/server.js"]
