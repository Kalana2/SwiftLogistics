FROM node:18-alpine
WORKDIR /app
COPY mock-services/wms-mock/package.json ./mock-services/wms-mock/
RUN cd mock-services/wms-mock && npm install --production
COPY shared/ ./shared/
COPY mock-services/wms-mock/ ./mock-services/wms-mock/
WORKDIR /app/mock-services/wms-mock
EXPOSE 4001
CMD ["node", "server.js"]
