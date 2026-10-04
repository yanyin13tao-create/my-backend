const http = require('node:http');
const { config } = require('./config');
const { createPostsStore } = require('./postsStore');
const { createRedisClient } = require('./redisClient');
const { createRequestHandler } = require('./routes');

async function start() {
  const redis = createRedisClient();
  const postsStore = createPostsStore(redis);
  const server = http.createServer(createRequestHandler({ postsStore, redis }));

  await redis.connect();

  server.listen(config.port, config.host, () => {
    console.log(`Backend running internally on http://${config.host}:${config.port}`);
  });
}

start().catch((error) => {
  console.error('Failed to start backend:', error);
  process.exit(1);
});
