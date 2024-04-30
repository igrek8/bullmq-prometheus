FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /usr/app
COPY package.json package-lock.json ./
RUN npm install --ci --silent && mv node_modules ../
COPY main.mjs .
EXPOSE 3000
USER node
ENTRYPOINT [ "node", "main.mjs" ]
