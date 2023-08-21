FROM node:18-alpine
ENV NODE_ENV=production
WORKDIR /usr/app
COPY package.json package-lock.json ./
RUN npm install --ci --silent && mv node_modules ../
COPY main.mjs .
EXPOSE 3000
ENTRYPOINT [ "node", "main.mjs" ]