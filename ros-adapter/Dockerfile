FROM node:18-alpine
WORKDIR /app
COPY ros-adapter/package.json ./ros-adapter/
RUN cd ros-adapter && npm install --production
COPY shared/ ./shared/
COPY ros-adapter/ ./ros-adapter/
WORKDIR /app/ros-adapter
EXPOSE 3003
CMD ["node", "server.js"]
