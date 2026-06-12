FROM node:22-alpine

WORKDIR /home/node/app

COPY package*.json ./
RUN npm ci --omit=dev

COPY --chown=node:node . .

USER node

ENV NODE_ENV=production
EXPOSE 8080

CMD ["node", "src/index.js"]
