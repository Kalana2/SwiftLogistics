FROM node:18-alpine
WORKDIR /app
COPY cms-adapter/package.json ./cms-adapter/
RUN cd cms-adapter && npm install --production
COPY shared/ ./shared/
COPY cms-adapter/ ./cms-adapter/
WORKDIR /app/cms-adapter
EXPOSE 3002
CMD ["node", "server.js"]
