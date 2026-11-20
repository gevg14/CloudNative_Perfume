FROM node:18-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
# Vite incrusta las variables VITE_* en el bundle al compilar
ARG VITE_API_GATEWAY_URL=http://localhost:8080
ARG VITE_AUTH_MODE=local
ARG VITE_AZURE_TENANT_ID=
ARG VITE_AZURE_CLIENT_ID=
ARG VITE_AZURE_REDIRECT_URI=
ENV VITE_API_GATEWAY_URL=$VITE_API_GATEWAY_URL \
    VITE_AUTH_MODE=$VITE_AUTH_MODE \
    VITE_AZURE_TENANT_ID=$VITE_AZURE_TENANT_ID \
    VITE_AZURE_CLIENT_ID=$VITE_AZURE_CLIENT_ID \
    VITE_AZURE_REDIRECT_URI=$VITE_AZURE_REDIRECT_URI
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
