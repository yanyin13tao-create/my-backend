const { config } = require('./config');

function createPostsStore(redis) {
  async function listPosts() {
    const entries = await redis.lRange(config.redisPostsKey, 0, config.maxPosts - 1);
    return entries.map((entry) => JSON.parse(entry));
  }

  async function addPost(post) {
    await redis
      .multi()
      .lPush(config.redisPostsKey, JSON.stringify(post))
      .lTrim(config.redisPostsKey, 0, config.maxPosts - 1)
      .exec();
  }

  return { addPost, listPosts };
}

module.exports = { createPostsStore };
