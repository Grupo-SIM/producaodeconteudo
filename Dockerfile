FROM mcr.microsoft.com/playwright:v1.65.0-noble

# Node 22.13+ (usa node:sqlite) + ffmpeg para render dos reels
RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg curl ca-certificates python3-pip \
 && pip3 install --no-cache-dir --break-system-packages faster-whisper \
 && curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
 && apt-get install -y --no-install-recommends nodejs \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    DATA_DIR=/data \
    HF_HOME=/data/modelos

VOLUME ["/data"]
EXPOSE 3000
CMD ["npm", "start"]
