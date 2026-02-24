FROM node:18-alpine
WORKDIR /app
COPY orchestration-service/package.json ./orchestration-service/
RUN cd orchestration-service && npm install --production
COPY shared/ ./shared/
COPY orchestration-service/ ./orchestration-service/
WORKDIR /app/orchestration-service
EXPOSE 3001
CMD ["node", "server.js"]
