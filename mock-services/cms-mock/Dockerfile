FROM node:18-alpine
WORKDIR /app
COPY mock-services/cms-mock/package.json ./mock-services/cms-mock/
RUN cd mock-services/cms-mock && npm install --production
COPY shared/ ./shared/
COPY mock-services/cms-mock/ ./mock-services/cms-mock/
WORKDIR /app/mock-services/cms-mock
EXPOSE 4000
CMD ["node", "server.js"]
