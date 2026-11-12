FROM mcr.microsoft.com/playwright:v1.65.0-noble

# Node 22.13+ (usa node:sqlite) + ffmpeg para render dos reels
RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg curl ca-certificates python3-pip \
 && pip3 install --no-cache-dir --break-system-packages faster-whisper \
 && curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
 && apt-get install -y --no-install-recommends nodejs \
 && rm -rf /var/lib/apt/lists/*

# Claude Code: roda os agentes pela assinatura do Claude (login em Configurações; fica em /data/claude).
# Versão fixada: o painel lê o stream-json e o texto do login, que mudam entre versões (mesma do claude-worker do Atlas).
ARG CLAUDE_CODE_VERSION=2.1.266
RUN npm install -g @anthropic-ai/claude-code@${CLAUDE_CODE_VERSION} && npm cache clean --force
# Teto de permissões do `claude -p`: nenhuma ferramenta que mexa no servidor (só a busca na web, quando o pedido pede)
COPY claude-managed-settings.json /etc/claude-code/managed-settings.json

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
