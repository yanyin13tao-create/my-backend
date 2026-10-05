const { randomUUID } = require('node:crypto');
const { config } = require('./config');
const { readJsonBody, sendJson } = require('./http');
const { moderateComment, moderatePost } = require('./moderation');
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

function getCommentsPostId(pathname) {
  const match = pathname.match(/^\/(?:api\/)?posts\/([^/]+)\/comments$/);
  return match ? decodeURIComponent(match[1]) : null;
}

function normalizeAttachments(value, limit) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .slice(0, limit)
    .map((attachment) => ({
      fileId: String(attachment.fileId || attachment.id || '').trim(),
      kind: 'image',
      mimeType: String(attachment.mimeType || ''),
      thumbnailFileId: String(attachment.thumbnailFileId || attachment.fileId || attachment.id || '').trim(),
    }))
    .filter((attachment) => /^[a-f0-9-]{36}$/i.test(attachment.fileId));
}

function decorateAttachment(attachment) {
  const fileId = attachment.fileId || attachment.id;
  const thumbnailFileId = attachment.thumbnailFileId || fileId;

  return {
    ...attachment,
    fileId,
    thumbnailFileId,
    url: `${config.fileServicePublicUrl}/files/${encodeURIComponent(fileId)}`,
    thumbnailUrl: `${config.fileServicePublicUrl}/files/${encodeURIComponent(thumbnailFileId)}`,
  };
}

async function decoratePost(post, commentsStore) {
  return {
    ...post,
    attachments: Array.isArray(post.attachments) ? post.attachments.map(decorateAttachment) : [],
    commentCount: await commentsStore.getCommentCount(post.id),
  };
}

function decorateComment(comment) {
  return {
    ...comment,
    attachments: Array.isArray(comment.attachments) ? comment.attachments.map(decorateAttachment) : [],
  };
}

async function decoratePostsResult(result, commentsStore) {
  return {
    ...result,
    posts: await Promise.all(result.posts.map((post) => decoratePost(post, commentsStore))),
  };
}

function createRequestHandler({ commentsStore, postsStore, redis }) {
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
        sendJson(res, 200, await decoratePostsResult(result, commentsStore));
        return;
      }

      if (req.method === 'POST' && isPostsPath(url.pathname)) {
        const body = await readJsonBody(req);
        const story = String(body.story || '').trim();
        const author = String(body.author || '').trim() || 'Anonymous Victim';
        const category = String(body.category || 'ghosted').trim();
        const attachments = normalizeAttachments(body.attachments, config.maxAttachmentsPerPost);

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
          attachments,
          commentCount: 0,
          createdAt: new Date().toISOString(),
        };

        await postsStore.addPost(post);
        sendJson(res, 201, { approved: true, post });
        return;
      }

      const commentsPostId = getCommentsPostId(url.pathname);
      if (req.method === 'GET' && commentsPostId) {
        const comments = await commentsStore.listComments(commentsPostId, {
          before: url.searchParams.get('before'),
          limit: url.searchParams.get('limit'),
        });
        sendJson(res, 200, {
          ...comments,
          comments: comments.comments.map(decorateComment),
        });
        return;
      }

      if (req.method === 'POST' && commentsPostId) {
        const body = await readJsonBody(req);
        const commentBody = String(body.body || '').trim();
        const author = String(body.author || '').trim() || 'Anonymous Victim';
        const attachments = normalizeAttachments(body.attachments, config.maxAttachmentsPerComment);

        if (!commentBody && attachments.length === 0) {
          sendJson(res, 400, { approved: false, reason: 'Comment text or image is required.' });
          return;
        }

        const postsResult = await postsStore.listPosts({ limit: config.maxPostsPageSize });
        const postExists = postsResult.posts.some((post) => post.id === commentsPostId);

        if (!postExists) {
          sendJson(res, 404, { error: 'Post not found' });
          return;
        }

        const moderation = moderateComment({ body: commentBody, author });
        if (!moderation.approved) {
          sendJson(res, 422, moderation);
          return;
        }

        const comment = {
          id: randomUUID(),
          postId: commentsPostId,
          author,
          body: commentBody,
          attachments,
          createdAt: new Date().toISOString(),
        };

        await commentsStore.addComment(comment);
        sendJson(res, 201, { approved: true, comment: decorateComment(comment) });
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

        if (result.post) {
          result.post = await decoratePost(result.post, commentsStore);
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

        if (result.post) {
          result.post = await decoratePost(result.post, commentsStore);
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
