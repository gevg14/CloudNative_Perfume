FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY src/ ./src/
COPY sql/ ./sql/
EXPOSE 4005
CMD ["node", "src/app.js"]
