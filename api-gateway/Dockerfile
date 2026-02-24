FROM node:18-alpine
WORKDIR /app
COPY api-gateway/package.json ./api-gateway/
RUN cd api-gateway && npm install --production
COPY shared/ ./shared/
COPY api-gateway/ ./api-gateway/
WORKDIR /app/api-gateway
EXPOSE 3000
CMD ["node", "server.js"]
