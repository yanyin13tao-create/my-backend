# Mintea

Plain JavaScript test backend using Node's built-in HTTP module. No Express,
TypeScript, or npm dependencies are required. Every request returns HTTP 200
with a greeting, the requested path (including query string), and an ISO timestamp.
The server listens on 0.0.0.0, using PORT or 3000 by default.

## Project structure

```text
mintea/
|-- src/
|   `-- server.js
|-- docker/
|   |-- Dockerfile
|   `-- nginx/
|       |-- Dockerfile
|       |-- 40-generate-self-signed-cert.sh
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

The Jenkins container needs the Docker CLI with Compose v2 and access to a
Docker daemon. A common setup mounts the host socket into Jenkins as
`/var/run/docker.sock`. Ports 80 and 443 must be available on the Docker host.

Both images are built from the repository checkout. The Docker client sends
the build contexts to the daemon, so the Jenkins workspace does not need to be
available as a bind-mount path on the Docker host. The Nginx image copies
`docker/nginx/default.conf` into the image and creates a self-signed localhost
certificate when its container starts. No repository or certificate bind mounts
are used.

For a standalone backend image build from the repository root, use
`docker build -f docker/Dockerfile -t mintea-backend .`.

The generated self-signed certificate is suitable only for this test and will
cause a browser trust warning. Use a managed secret or trusted certificate for
a public deployment.

Suggested commands for your existing Jenkins deployment stage:

```sh
docker compose config --quiet
docker compose up --build -d
docker compose exec -T nginx nginx -t
```

Compose uses `mintea` as its project name. Docker therefore names the containers
`mintea-backend-1` and `mintea-nginx-1`, and names the locally built images
`mintea-backend` and `mintea-nginx`.

When deploying this rename for the first time, remove the old Compose project
before starting Mintea so it releases ports 80 and 443:

```sh
docker compose -p my-backend down
docker compose up --build -d
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
If Jenkins uses Docker-in-Docker rather than the host socket, ports 80 and 443
are published on that Docker daemon container and must also be exposed from it.
