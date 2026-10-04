const { config } = require('./config');

function parsePost(entry) {
  try {
    return JSON.parse(entry);
  } catch {
    return null;
  }
}

function shouldKeepPost(post, now = Date.now()) {
  if (!post || post.type !== 'user' || !post.createdAt) {
    return Boolean(post);
  }

  const createdAt = new Date(post.createdAt).getTime();
  if (Number.isNaN(createdAt)) {
    return true;
  }

  const expiresAt = createdAt + config.postTtlDays * 24 * 60 * 60 * 1000;
  const hasEnoughLikesToKeep = Number(post.count || 0) > config.minLikesToKeepExpiredPost;

  return now < expiresAt || hasEnoughLikesToKeep;
}

function createPostsStore(redis) {
  async function readAllPosts() {
    const entries = await redis.lRange(config.redisPostsKey, 0, -1);
    return entries.map(parsePost).filter(Boolean);
  }

  async function replacePosts(posts) {
    const serializedPosts = posts.map((post) => JSON.stringify(post));
    const transaction = redis.multi().del(config.redisPostsKey);

    if (serializedPosts.length) {
      transaction.rPush(config.redisPostsKey, serializedPosts);
      transaction.lTrim(config.redisPostsKey, 0, config.maxPosts - 1);
    }

    await transaction.exec();
  }

  async function cleanupExpiredPosts() {
    const posts = await readAllPosts();
    const activePosts = posts.filter((post) => shouldKeepPost(post));

    if (activePosts.length !== posts.length) {
      await replacePosts(activePosts);
    }

    return activePosts;
  }

  async function listPosts() {
    const posts = await cleanupExpiredPosts();
    return posts.slice(0, config.maxPosts);
  }

  async function addPost(post) {
    await cleanupExpiredPosts();

    await redis
      .multi()
      .lPush(config.redisPostsKey, JSON.stringify(post))
      .lTrim(config.redisPostsKey, 0, config.maxPosts - 1)
      .exec();
  }

  async function likePost(id) {
    const posts = await cleanupExpiredPosts();
    const post = posts.find((currentPost) => currentPost.id === id);

    if (!post) {
      return null;
    }

    post.count = Number(post.count || 0) + 1;
    await replacePosts(posts);

    return post;
  }

  return { addPost, likePost, listPosts };
}

module.exports = { createPostsStore };
