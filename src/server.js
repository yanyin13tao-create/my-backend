const http = require('node:http');

const PORT = Number(process.env.PORT ?? 3000);
const HOST = '0.0.0.0';

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    message: 'Hello from the Mintea backend service!',
    path: req.url,
    timestamp: new Date().toISOString()
  }));
});

server.listen(PORT, HOST, () => {
  console.log(`Backend running internally on http://${HOST}:${PORT}`);
});
