# my-backend

Plain JavaScript test backend using Node's built-in HTTP module. No Express,
TypeScript, or npm dependencies are required. Every request returns HTTP 200
with a greeting, the requested path (including query string), and an ISO timestamp.
The server listens on 0.0.0.0, using PORT or 3000 by default.

## Project structure

```text
my-backend/
|-- src/
|   `-- server.js
|-- docker/
|   |-- Dockerfile
|   `-- nginx/
|       `-- default.conf
|-- docker-compose.yml
|-- package.json
|-- package-lock.json
|-- .dockerignore
|-- .gitignore
`-- README.md
```

Application code lives in `src/`, and container configuration lives in `docker/`.
Compose stays at the repository root so Jenkins can keep using `docker compose`
without extra flags. The build context remains the repository root, where
`.dockerignore` and the package manifests are located.

## Deployment through Jenkins

`docker/Dockerfile` uses Node.js 24 Alpine and starts `src/server.js` directly. No build
step is needed for JavaScript. npm ci uses the included dependency-free lockfile.

Run deployment commands from the repository checkout on the deployment host.
The Jenkins agent needs Docker Engine access and Docker Compose v2, and ports
80 and 443 must be available. If Jenkins uses a remote Docker daemon or runs
inside a container, bind-mount source paths must exist on the Docker daemon's
host, including the checkout path for `docker/nginx/default.conf`.

Compose mounts that file at `/etc/nginx/conf.d/default.conf` inside Nginx.
For a standalone backend image build from the repository root, use
`docker build -f docker/Dockerfile -t my-backend .`.

Provision these files on the deployment host before starting Compose:

- /etc/ssl/certs/nginx-selfsigned.crt
- /etc/ssl/private/nginx-selfsigned.key

The certificate and private key must match. They are mounted read-only into
Nginx and must not be committed to Git. A self-signed certificate is suitable
for this test; browsers will display a trust warning.

Suggested commands for your existing Jenkins deployment stage:

```sh
docker compose config --quiet
docker compose up --build -d
docker compose exec -T nginx nginx -t
```

Compose starts the backend on its private network. Nginx redirects port 80 to
HTTPS on port 443, then proxies requests to backend:3000. The backend's port
is not published directly to the host.

Optional verification on the deployment host after startup:

```sh
curl -I http://localhost/example
curl --fail --retry 5 --retry-connrefused --retry-delay 2 -k 'https://localhost/example?test=1'
docker compose logs --tail=50
```

The first request should redirect to HTTPS; the second should return JSON.
The -k option is only for the self-signed test certificate.

No Jenkinsfile is included; use these commands in your existing pipeline.
The application does not load .env files. Set runtime variables through Compose.
