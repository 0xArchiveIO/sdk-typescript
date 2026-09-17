FROM node:22-alpine
WORKDIR /app
COPY server.js package.json ./
COPY public ./public
ENV PORT=3200
EXPOSE 3200
CMD ["node", "server.js"]
