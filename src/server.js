const http = require('node:http');
const { config } = require('./config');
const { createCommentsStore } = require('./commentsStore');
const { createPostsStore } = require('./postsStore');
const { createRedisClient } = require('./redisClient');
const { createRequestHandler } = require('./routes');

async function start() {
  const redis = createRedisClient();
  const commentsStore = createCommentsStore(redis);
  const postsStore = createPostsStore(redis, { commentsStore });
  const server = http.createServer(createRequestHandler({ commentsStore, postsStore, redis }));

  await redis.connect();

  server.listen(config.port, config.host, () => {
    console.log(`Backend running internally on http://${config.host}:${config.port}`);
  });
}

start().catch((error) => {
  console.error('Failed to start backend:', error);
  process.exit(1);
});
