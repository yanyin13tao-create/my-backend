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
  function getPostLikesKey(id) {
    return `${config.redisPostLikesKeyPrefix}:${id}`;
  }

  function getPostDislikesKey(id) {
    return `${config.redisPostDislikesKeyPrefix}:${id}`;
  }

  async function deleteVoteSets(ids) {
    const voteKeys = ids.flatMap((id) => [getPostLikesKey(id), getPostDislikesKey(id)]);

    if (voteKeys.length) {
      await redis.del(voteKeys);
    }
  }

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
      const activeIds = new Set(activePosts.map((post) => post.id));
      const expiredIds = posts
        .filter((post) => post.id && !activeIds.has(post.id))
        .map((post) => post.id);

      await replacePosts(activePosts);
      await deleteVoteSets(expiredIds);
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

  async function likePost(id, clientId) {
    const posts = await cleanupExpiredPosts();
    const post = posts.find((currentPost) => currentPost.id === id);

    if (!post) {
      return null;
    }

    const likeResult = await redis.sAdd(getPostLikesKey(id), clientId);
    if (likeResult === 0) {
      return { liked: false, post };
    }

    post.count = Number(post.count || 0) + 1;
    await replacePosts(posts);

    return { liked: true, post };
  }

  async function dislikePost(id, clientId) {
    const posts = await cleanupExpiredPosts();
    const post = posts.find((currentPost) => currentPost.id === id);

    if (!post) {
      return null;
    }

    const dislikeResult = await redis.sAdd(getPostDislikesKey(id), clientId);
    if (dislikeResult === 0) {
      return { deleted: false, disliked: false, post };
    }

    post.dislikeCount = Number(post.dislikeCount || 0) + 1;

    if (post.dislikeCount >= config.dislikesToDeletePost) {
      await replacePosts(posts.filter((currentPost) => currentPost.id !== id));
      await deleteVoteSets([id]);
      return { deleted: true, disliked: true, postId: id };
    }

    await replacePosts(posts);
    return { deleted: false, disliked: true, post };
  }

  return { addPost, dislikePost, likePost, listPosts };
}

module.exports = { createPostsStore };
