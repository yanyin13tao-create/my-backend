FROM nginx:stable-alpine

RUN apk add --no-cache openssl

COPY docker/nginx/default.conf /etc/nginx/conf.d/default.conf
COPY docker/nginx/40-generate-self-signed-cert.sh /docker-entrypoint.d/40-generate-self-signed-cert.sh

RUN chmod +x /docker-entrypoint.d/40-generate-self-signed-cert.sh

EXPOSE 80 443
