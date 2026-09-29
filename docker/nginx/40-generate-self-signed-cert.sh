#!/bin/sh
set -eu

certificate_file=/etc/ssl/certs/nginx-selfsigned.crt
private_key_file=/etc/ssl/private/nginx-selfsigned.key

if [ ! -f "$certificate_file" ] || [ ! -f "$private_key_file" ]; then
  mkdir -p /etc/ssl/certs /etc/ssl/private
  openssl req \
    -x509 \
    -nodes \
    -days 365 \
    -newkey rsa:2048 \
    -keyout "$private_key_file" \
    -out "$certificate_file" \
    -subj '/CN=localhost' \
    -addext 'subjectAltName=DNS:localhost,IP:127.0.0.1'
  chmod 600 "$private_key_file"
fi
