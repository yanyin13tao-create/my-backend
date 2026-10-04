const config = {
  host: '0.0.0.0',
  port: Number(process.env.PORT ?? 3000),
  maxBodyBytes: 16 * 1024,
  maxPosts: Number(process.env.MAX_POSTS ?? 100),
  redisPostsKey: process.env.REDIS_POSTS_KEY || 'mintea:posts',
  redisUrl: process.env.REDIS_URL || 'redis://redis:6379',
};

module.exports = { config };
