const config = {
  host: '0.0.0.0',
  port: Number(process.env.PORT ?? 3000),
  maxBodyBytes: 16 * 1024,
  maxAttachmentsPerComment: Number(process.env.MAX_ATTACHMENTS_PER_COMMENT ?? 1),
  maxAttachmentsPerPost: Number(process.env.MAX_ATTACHMENTS_PER_POST ?? 4),
  maxCommentsPageSize: Number(process.env.MAX_COMMENTS_PAGE_SIZE ?? 50),
  maxCommentsPerPost: Number(process.env.MAX_COMMENTS_PER_POST ?? 100),
  maxPosts: Number(process.env.MAX_POSTS ?? 100),
  defaultCommentsPageSize: Number(process.env.DEFAULT_COMMENTS_PAGE_SIZE ?? 25),
  defaultPostsPageSize: Number(process.env.DEFAULT_POSTS_PAGE_SIZE ?? 50),
  fileServicePublicUrl: process.env.FILE_SERVICE_PUBLIC_URL || 'http://localhost:4000',
  maxPostsPageSize: Number(process.env.MAX_POSTS_PAGE_SIZE ?? 100),
  postTtlDays: Number(process.env.POST_TTL_DAYS ?? 5),
  minLikesToKeepExpiredPost: Number(process.env.MIN_LIKES_TO_KEEP_EXPIRED_POST ?? 50),
  dislikesToDeletePost: Number(process.env.DISLIKES_TO_DELETE_POST ?? 100),
  redisPostDislikesKeyPrefix: process.env.REDIS_POST_DISLIKES_KEY_PREFIX || 'mintea:post-dislikes',
  redisPostLikesKeyPrefix: process.env.REDIS_POST_LIKES_KEY_PREFIX || 'mintea:post-likes',
  redisPostCommentsCountKeyPrefix:
    process.env.REDIS_POST_COMMENTS_COUNT_KEY_PREFIX || 'mintea:post-comments-count',
  redisPostCommentsKeyPrefix: process.env.REDIS_POST_COMMENTS_KEY_PREFIX || 'mintea:post-comments',
  redisPostsKey: process.env.REDIS_POSTS_KEY || 'mintea:posts',
  redisPostsVersionKey: process.env.REDIS_POSTS_VERSION_KEY || 'mintea:posts:version',
  redisUrl: process.env.REDIS_URL || 'redis://redis:6379',
};

module.exports = { config };
