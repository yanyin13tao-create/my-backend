const { randomUUID } = require('node:crypto');
const { readJsonBody, sendJson } = require('./http');
const { moderatePost } = require('./moderation');

function isPostsPath(pathname) {
  return pathname === '/posts' || pathname === '/api/posts';
}

function createRequestHandler({ postsStore, redis }) {
  return async function handleRequest(req, res) {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

    try {
      if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/health')) {
        sendJson(res, 200, {
          message: 'Hello from the Mintea backend service!',
          path: req.url,
          redis: redis.isReady ? 'ready' : 'not-ready',
          timestamp: new Date().toISOString(),
        });
        return;
      }

      if (req.method === 'GET' && isPostsPath(url.pathname)) {
        const posts = await postsStore.listPosts();
        sendJson(res, 200, { posts });
        return;
      }

      if (req.method === 'POST' && isPostsPath(url.pathname)) {
        const body = await readJsonBody(req);
        const story = String(body.story || '').trim();
        const author = String(body.author || '').trim() || 'Anonymous Victim';
        const category = String(body.category || 'ghosted').trim();

        if (!story) {
          sendJson(res, 400, { approved: false, reason: 'Story is required.' });
          return;
        }

        const moderation = moderatePost({ story, author });
        if (!moderation.approved) {
          sendJson(res, 422, moderation);
          return;
        }

        const post = {
          id: randomUUID(),
          category,
          type: 'user',
          author,
          count: 0,
          story,
          createdAt: new Date().toISOString(),
        };

        await postsStore.addPost(post);
        sendJson(res, 201, { approved: true, post });
        return;
      }

      sendJson(res, 404, { error: 'Not found' });
    } catch (error) {
      sendJson(res, error.statusCode || 500, {
        error: error.statusCode ? error.message : 'Internal server error',
      });
    }
  };
}

module.exports = { createRequestHandler };
