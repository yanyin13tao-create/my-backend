const { randomUUID } = require('node:crypto');
const { readJsonBody, sendJson } = require('./http');
const { moderatePost } = require('./moderation');
const { getSession } = require('./session');

function isPostsPath(pathname) {
  return pathname === '/posts' || pathname === '/api/posts';
}

function getLikePostId(pathname) {
  const match = pathname.match(/^\/(?:api\/)?posts\/([^/]+)\/like$/);
  return match ? decodeURIComponent(match[1]) : null;
}

function getDislikePostId(pathname) {
  const match = pathname.match(/^\/(?:api\/)?posts\/([^/]+)\/dislike$/);
  return match ? decodeURIComponent(match[1]) : null;
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
        const result = await postsStore.listPosts({
          before: url.searchParams.get('before'),
          limit: url.searchParams.get('limit'),
          version: url.searchParams.get('version'),
        });
        sendJson(res, 200, result);
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

      const likedPostId = getLikePostId(url.pathname);
      if (req.method === 'POST' && likedPostId) {
        const session = getSession(req);
        const result = await postsStore.likePost(likedPostId, session.id);

        if (!result) {
          sendJson(res, 404, { error: 'Post not found' }, session.headers);
          return;
        }

        sendJson(res, 200, result, session.headers);
        return;
      }

      const dislikedPostId = getDislikePostId(url.pathname);
      if (req.method === 'POST' && dislikedPostId) {
        const session = getSession(req);
        const result = await postsStore.dislikePost(dislikedPostId, session.id);

        if (!result) {
          sendJson(res, 404, { error: 'Post not found' }, session.headers);
          return;
        }

        sendJson(res, 200, result, session.headers);
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
