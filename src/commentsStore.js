const { config } = require('./config');

function parseComment(entry) {
  try {
    return JSON.parse(entry);
  } catch {
    return null;
  }
}

function clampLimit(limit) {
  const parsedLimit = Number(limit);

  if (!Number.isFinite(parsedLimit) || parsedLimit <= 0) {
    return config.defaultCommentsPageSize;
  }

  return Math.min(Math.floor(parsedLimit), config.maxCommentsPageSize);
}

function createCursor(comment) {
  if (!comment) {
    return null;
  }

  return Buffer.from(`${comment.createdAt || ''}|${comment.id || ''}`, 'utf8').toString('base64url');
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

function createCommentsStore(redis) {
  function getCommentsKey(postId) {
    return `${config.redisPostCommentsKeyPrefix}:${postId}`;
  }

  function getCommentsCountKey(postId) {
    return `${config.redisPostCommentsCountKeyPrefix}:${postId}`;
  }

  async function getCommentCount(postId) {
    const count = await redis.get(getCommentsCountKey(postId));
    return Number(count || 0);
  }

  async function addComment(comment) {
    await redis
      .multi()
      .lPush(getCommentsKey(comment.postId), JSON.stringify(comment))
      .lTrim(getCommentsKey(comment.postId), 0, config.maxCommentsPerPost - 1)
      .incr(getCommentsCountKey(comment.postId))
      .exec();
  }

  async function listComments(postId, { before, limit } = {}) {
    const comments = (await redis.lRange(getCommentsKey(postId), 0, -1))
      .map(parseComment)
      .filter(Boolean);
    const pageSize = clampLimit(limit);
    const cursor = parseCursor(before);
    let startIndex = 0;

    if (cursor) {
      const cursorTime = new Date(cursor.createdAt).getTime();
      const cursorIndex = comments.findIndex((comment) => comment.id === cursor.id);

      if (cursorIndex >= 0) {
        startIndex = cursorIndex + 1;
      } else if (!Number.isNaN(cursorTime)) {
        startIndex = comments.findIndex((comment) => new Date(comment.createdAt).getTime() < cursorTime);
        if (startIndex < 0) {
          startIndex = comments.length;
        }
      }
    }

    const pageComments = comments.slice(startIndex, startIndex + pageSize);
    const hasMore = startIndex + pageSize < comments.length;

    return {
      comments: pageComments,
      hasMore,
      nextCursor: hasMore ? createCursor(pageComments[pageComments.length - 1]) : null,
    };
  }

  async function deleteCommentsForPosts(postIds) {
    const keys = postIds.flatMap((postId) => [getCommentsKey(postId), getCommentsCountKey(postId)]);

    if (keys.length) {
      await redis.del(keys);
    }
  }

  return { addComment, deleteCommentsForPosts, getCommentCount, listComments };
}

module.exports = { createCommentsStore };
