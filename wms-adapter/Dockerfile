FROM node:18-alpine
WORKDIR /app
COPY wms-adapter/package.json ./wms-adapter/
RUN cd wms-adapter && npm install --production
COPY shared/ ./shared/
COPY wms-adapter/ ./wms-adapter/
WORKDIR /app/wms-adapter
EXPOSE 3004
CMD ["node", "server.js"]
