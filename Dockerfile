FROM node:18

WORKDIR /app

COPY package.json ./
RUN npm install --legacy-peer-deps

COPY . .

ENV PORT=10000
EXPOSE 10000

CMD ["npm", "start"]
