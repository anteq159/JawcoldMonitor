# The build output is plain static files, so the Node stage always runs on
# the build machine's own architecture - a cross-architecture build then
# needs no slow emulated `npm ci`.
FROM --platform=$BUILDPLATFORM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
# nginx.conf must live inside this build context (./frontend) - COPY cannot
# reach outside it, a ../ path fails the very first build on a fresh clone.
COPY nginx.conf /etc/nginx/nginx.conf
ARG VERSION=dev
LABEL org.opencontainers.image.source="https://github.com/anteq159/JawcoldMonitor" \
      org.opencontainers.image.version="${VERSION}"
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
