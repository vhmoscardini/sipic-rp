FROM node:20-alpine
WORKDIR /app
COPY . .
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=8080
EXPOSE 8080
CMD ["node", "server.mjs"]
