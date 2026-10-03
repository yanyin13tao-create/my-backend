ARG FRONTEND_IMAGE=my-frontend-static:latest
FROM ${FRONTEND_IMAGE} AS frontend_static

FROM nginx:stable-alpine

RUN apk add --no-cache openssl

COPY --from=frontend_static /usr/share/nginx/html /usr/share/nginx/html
COPY docker/nginx/default.conf /etc/nginx/conf.d/default.conf
COPY docker/nginx/40-generate-self-signed-cert.sh /docker-entrypoint.d/40-generate-self-signed-cert.sh

RUN chmod +x /docker-entrypoint.d/40-generate-self-signed-cert.sh

EXPOSE 80 443
