const { randomUUID } = require('node:crypto');

const sessionCookieName = 'mintea_session_id';
const sessionMaxAgeSeconds = 60 * 60 * 24 * 365;

function parseCookies(cookieHeader = '') {
  return Object.fromEntries(
    cookieHeader
      .split(';')
      .map((cookie) => cookie.trim())
      .filter(Boolean)
      .map((cookie) => {
        const separatorIndex = cookie.indexOf('=');
        if (separatorIndex === -1) {
          return [cookie, ''];
        }

        return [
          decodeURIComponent(cookie.slice(0, separatorIndex)),
          decodeURIComponent(cookie.slice(separatorIndex + 1)),
        ];
      }),
  );
}

function getSession(req) {
  const cookies = parseCookies(req.headers.cookie);
  const existingSessionId = cookies[sessionCookieName];

  if (existingSessionId) {
    return { id: existingSessionId, headers: {} };
  }

  const id = randomUUID();
  return {
    id,
    headers: {
      'Set-Cookie': `${sessionCookieName}=${encodeURIComponent(id)}; Max-Age=${sessionMaxAgeSeconds}; Path=/; HttpOnly; SameSite=Lax`,
    },
  };
}

module.exports = { getSession };
