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

function clampLimit(limit) {
  const parsedLimit = Number(limit);

  if (!Number.isFinite(parsedLimit) || parsedLimit <= 0) {
    return config.defaultPostsPageSize;
  }

  return Math.min(Math.floor(parsedLimit), config.maxPostsPageSize);
}

function createCursor(post) {
  if (!post) {
    return null;
  }

  return Buffer.from(`${post.createdAt || ''}|${post.id || ''}`, 'utf8').toString('base64url');
}

function parseCursor(cursor) {
  if (!cursor) {
    return null;
  }

  try {
    const [createdAt, id] = Buffer.from(cursor, 'base64url').toString('utf8').split('|');
    return { createdAt, id };
  } catch {
    return null;
  }
}

function createPostsStore(redis, { commentsStore } = {}) {
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

  async function bumpVersion() {
    await redis.incr(config.redisPostsVersionKey);
  }

  async function getVersion() {
    return (await redis.get(config.redisPostsVersionKey)) || '0';
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
      if (commentsStore) {
        await commentsStore.deleteCommentsForPosts(expiredIds);
      }
      await deleteVoteSets(expiredIds);
      await bumpVersion();
    }

    return activePosts;
  }

  function getPage(posts, { before, limit }) {
    const pageSize = clampLimit(limit);
    const cursor = parseCursor(before);
    let startIndex = 0;

    if (cursor) {
      const cursorTime = new Date(cursor.createdAt).getTime();
      const cursorIndex = posts.findIndex((post) => post.id === cursor.id);

      if (cursorIndex >= 0) {
        startIndex = cursorIndex + 1;
      } else if (!Number.isNaN(cursorTime)) {
        startIndex = posts.findIndex((post) => new Date(post.createdAt).getTime() < cursorTime);
        if (startIndex < 0) {
          startIndex = posts.length;
        }
      }
    }

    const pagePosts = posts.slice(startIndex, startIndex + pageSize);
    const hasMore = startIndex + pageSize < posts.length;

    return {
      hasMore,
      nextCursor: hasMore ? createCursor(pagePosts[pagePosts.length - 1]) : null,
      posts: pagePosts,
    };
  }

  async function listPosts({ before, limit, version } = {}) {
    const posts = await cleanupExpiredPosts();
    const currentVersion = await getVersion();

    if (!before && version && version === currentVersion) {
      return {
        hasMore: posts.length > 0,
        nextCursor: null,
        posts: [],
        unchanged: true,
        version: currentVersion,
      };
    }

    return {
      ...getPage(posts, { before, limit }),
      unchanged: false,
      version: currentVersion,
    };
  }

  async function addPost(post) {
    await cleanupExpiredPosts();

    await redis
      .multi()
      .lPush(config.redisPostsKey, JSON.stringify(post))
      .lTrim(config.redisPostsKey, 0, config.maxPosts - 1)
      .incr(config.redisPostsVersionKey)
      .exec();
  }

  async function likePost(id, clientId) {
    const posts = await cleanupExpiredPosts();
    const post = posts.find((currentPost) => currentPost.id === id);

    if (!post) {
      return null;
    }

    const likesKey = getPostLikesKey(id);
    const dislikesKey = getPostDislikesKey(id);
    const alreadyLiked = await redis.sIsMember(likesKey, clientId);

    if (alreadyLiked) {
      await redis.sRem(likesKey, clientId);
      post.count = Math.max(0, Number(post.count || 0) - 1);
      await replacePosts(posts);
      await bumpVersion();
      return { disliked: false, liked: false, post };
    }

    const removedDislike = await redis.sRem(dislikesKey, clientId);
    await redis.sAdd(likesKey, clientId);

    post.count = Number(post.count || 0) + 1;
    if (removedDislike) {
      post.dislikeCount = Math.max(0, Number(post.dislikeCount || 0) - 1);
    }

    await replacePosts(posts);
    await bumpVersion();

    return { disliked: false, liked: true, post };
  }

  async function dislikePost(id, clientId) {
    const posts = await cleanupExpiredPosts();
    const post = posts.find((currentPost) => currentPost.id === id);

    if (!post) {
      return null;
    }

    const likesKey = getPostLikesKey(id);
    const dislikesKey = getPostDislikesKey(id);
    const alreadyDisliked = await redis.sIsMember(dislikesKey, clientId);

    if (alreadyDisliked) {
      await redis.sRem(dislikesKey, clientId);
      post.dislikeCount = Math.max(0, Number(post.dislikeCount || 0) - 1);
      await replacePosts(posts);
      await bumpVersion();
      return { deleted: false, disliked: false, liked: false, post };
    }

    const removedLike = await redis.sRem(likesKey, clientId);
    await redis.sAdd(dislikesKey, clientId);

    if (removedLike) {
      post.count = Math.max(0, Number(post.count || 0) - 1);
    }
    post.dislikeCount = Number(post.dislikeCount || 0) + 1;

    if (post.dislikeCount >= config.dislikesToDeletePost) {
      await replacePosts(posts.filter((currentPost) => currentPost.id !== id));
      if (commentsStore) {
        await commentsStore.deleteCommentsForPosts([id]);
      }
      await deleteVoteSets([id]);
      await bumpVersion();
      return { deleted: true, disliked: true, liked: false, postId: id };
    }

    await replacePosts(posts);
    await bumpVersion();
    return { deleted: false, disliked: true, liked: false, post };
  }

  return { addPost, dislikePost, likePost, listPosts };
}

module.exports = { createPostsStore };
