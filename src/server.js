const http = require('node:http');
const { randomUUID } = require('node:crypto');

const PORT = Number(process.env.PORT ?? 3000);
const HOST = '0.0.0.0';
const MAX_BODY_BYTES = 16 * 1024;

const blockedPatterns = [
  { pattern: /\b(kill|murder|stab|shoot|bomb|assault)\b/i, reason: 'Violent threats are not allowed.' },
  { pattern: /\b(doxx|address|phone number|ssn|social security)\b/i, reason: 'Private personal information is not allowed.' },
  { pattern: /\b(underage|minor|child)\b.*\b(sex|sexual|nude|nudes)\b/i, reason: 'Illegal sexual content is not allowed.' },
  { pattern: /\b(sell|buy|ship)\b.*\b(cocaine|heroin|meth|fentanyl)\b/i, reason: 'Illegal drug transaction content is not allowed.' },
  { pattern: /\b(card number|credit card|bank login|password)\b/i, reason: 'Stolen credential or financial information is not allowed.' },
];

const posts = [];

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
  });
  res.end(JSON.stringify(payload));
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';

    req.on('data', (chunk) => {
      body += chunk;
      if (Buffer.byteLength(body) > MAX_BODY_BYTES) {
        reject(Object.assign(new Error('Request body is too large.'), { statusCode: 413 }));
        req.destroy();
      }
    });

    req.on('end', () => {
      if (!body) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(body));
      } catch {
        reject(Object.assign(new Error('Invalid JSON body.'), { statusCode: 400 }));
      }
    });

    req.on('error', reject);
  });
}

function moderatePost({ story, author }) {
  const text = `${author} ${story}`;
  const blocked = blockedPatterns.find(({ pattern }) => pattern.test(text));

  if (blocked) {
    return { approved: false, reason: blocked.reason };
  }

  return { approved: true };
}

function isPostsPath(pathname) {
  return pathname === '/posts' || pathname === '/api/posts';
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  try {
    if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/health')) {
      sendJson(res, 200, {
        message: 'Hello from the Mintea backend service!',
        path: req.url,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    if (req.method === 'GET' && isPostsPath(url.pathname)) {
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
        time: 'Just now',
        author,
        count: 0,
        story,
        createdAt: new Date().toISOString(),
      };

      posts.unshift(post);
      sendJson(res, 201, { approved: true, post });
      return;
    }

    sendJson(res, 404, { error: 'Not found' });
  } catch (error) {
    sendJson(res, error.statusCode || 500, {
      error: error.statusCode ? error.message : 'Internal server error',
    });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Backend running internally on http://${HOST}:${PORT}`);
});
