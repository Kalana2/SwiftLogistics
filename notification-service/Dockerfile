FROM node:18-alpine
WORKDIR /app
COPY notification-service/package.json ./notification-service/
RUN cd notification-service && npm install --production
COPY shared/ ./shared/
COPY notification-service/ ./notification-service/
WORKDIR /app/notification-service
EXPOSE 3005
CMD ["node", "server.js"]
