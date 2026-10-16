# Image Saboteur : serveur Node.js sans dépendance.
# node:22-alpine est publiée pour amd64, arm64 et arm/v7 + arm/v6 :
# elle tourne sur un PC comme sur tous les Raspberry Pi (Zero/1 compris).
ARG NODE_VERSION=22
FROM node:${NODE_VERSION}-alpine

ENV NODE_ENV=production \
    PORT=8000 \
    HOST=0.0.0.0

WORKDIR /app

# Seuls les fichiers servis par server.js sont copiés (voir .dockerignore).
COPY --chown=node:node server.js game.js app.js pixel.js index.html cartes.html style.css ./
COPY --chown=node:node fonts/ ./fonts/

USER node
EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q --spider "http://127.0.0.1:${PORT}/" || exit 1

CMD ["node", "server.js"]
