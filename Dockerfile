FROM node:22-alpine
ENV NODE_ sg ENV=production
WORKDIR /usr/app
COPY package.json package-lock.json ./
RUN npm install --ci --silent \
    && npm install typescript --global
COPY tsconfig.json ./
COPY main.ts .
RUN npm run build
COPY main.js .
EXPOSE 3000
USER node
ENTRYPOINT [ "node", "main.js" ]
