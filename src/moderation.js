const blockedPatterns = [
  { pattern: /\b(kill|murder|stab|shoot|bomb|assault)\b/i, reason: 'Violent threats are not allowed.' },
  { pattern: /\b(doxx|address|phone number|ssn|social security)\b/i, reason: 'Private personal information is not allowed.' },
  { pattern: /\b(underage|minor|child)\b.*\b(sex|sexual|nude|nudes)\b/i, reason: 'Illegal sexual content is not allowed.' },
  { pattern: /\b(sell|buy|ship)\b.*\b(cocaine|heroin|meth|fentanyl)\b/i, reason: 'Illegal drug transaction content is not allowed.' },
  { pattern: /\b(card number|credit card|bank login|password)\b/i, reason: 'Stolen credential or financial information is not allowed.' },
];

function moderatePost({ story, author }) {
  const text = `${author} ${story}`;
  const blocked = blockedPatterns.find(({ pattern }) => pattern.test(text));

  if (blocked) {
    return { approved: false, reason: blocked.reason };
  }

  return { approved: true };
}

function moderateComment({ body, author }) {
  return moderatePost({ story: body, author });
}

module.exports = { moderateComment, moderatePost };
