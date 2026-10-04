const { createClient } = require('redis');
const { config } = require('./config');

function createRedisClient() {
  const client = createClient({ url: config.redisUrl });

  client.on('error', (error) => {
    console.error('Redis error:', error);
  });

  return client;
}

module.exports = { createRedisClient };
