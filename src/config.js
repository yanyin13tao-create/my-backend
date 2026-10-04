const config = {
  host: '0.0.0.0',
  port: Number(process.env.PORT ?? 3000),
  maxBodyBytes: 16 * 1024,
  maxPosts: Number(process.env.MAX_POSTS ?? 100),
  defaultPostsPageSize: Number(process.env.DEFAULT_POSTS_PAGE_SIZE ?? 50),
  maxPostsPageSize: Number(process.env.MAX_POSTS_PAGE_SIZE ?? 100),
  postTtlDays: Number(process.env.POST_TTL_DAYS ?? 5),
  minLikesToKeepExpiredPost: Number(process.env.MIN_LIKES_TO_KEEP_EXPIRED_POST ?? 50),
  dislikesToDeletePost: Number(process.env.DISLIKES_TO_DELETE_POST ?? 100),
  redisPostDislikesKeyPrefix: process.env.REDIS_POST_DISLIKES_KEY_PREFIX || 'mintea:post-dislikes',
  redisPostLikesKeyPrefix: process.env.REDIS_POST_LIKES_KEY_PREFIX || 'mintea:post-likes',
  redisPostsKey: process.env.REDIS_POSTS_KEY || 'mintea:posts',
  redisPostsVersionKey: process.env.REDIS_POSTS_VERSION_KEY || 'mintea:posts:version',
  redisUrl: process.env.REDIS_URL || 'redis://redis:6379',
};

module.exports = { config };
