// ═══════════════════════════════════════════════════════════════════════════
// server/theme-inject.js — adds <script src="/kievora-theme.js"> to every HTML page
// the server sends, so no .html file ever has to include it.
//
//   app.use(require('./theme-inject')());      // in server/index.js, BEFORE express.static
//
// • Only real pages are touched: GET requests for "/", "/something" or "/something.html".
//   /api/*, scripts, images, CSS and JSON never pass through here.
// • The tag goes right after <head>, so the theme runs before the page's own CSS is
//   parsed and the first paint is already indigo/cyan.
// • Pages that already include the script (or opt out with <meta name="kv-theme" content="off">)
//   are left alone. Non-HTML and non-200 responses stream through untouched.
// • Turn it off without touching code:  KIEVORA_THEME=off  (environment variable).
// ═══════════════════════════════════════════════════════════════════════════
const path = require('path');

module.exports = function themeInject(opts = {}) {
  const src = opts.src || '/kievora-theme.js';
  const version = opts.version || '1';
  const TAG = `<script src="${src}?v=${version}"></script>`;
  const disabled = String(process.env.KIEVORA_THEME || '').toLowerCase() === 'off';

  return function (req, res, next) {
    if (disabled || req.method !== 'GET') return next();
    const pathname = (req.path || String(req.url || '').split('?')[0] || '/');
    if (pathname.startsWith('/api/')) return next();
    const ext = path.extname(pathname);
    if (ext && ext.toLowerCase() !== '.html') return next();      // images, js, css, fonts …

    const origWrite = res.write;
    const origEnd = res.end;
    let chunks = null;                                              // null = pass-through, array = buffering

    const isHtml = () =>
      res.statusCode === 200 && /text\/html/i.test(String(res.getHeader('Content-Type') || ''));
    const restore = () => { res.write = origWrite; res.end = origEnd; };
    const toBuf = (c, enc) => (Buffer.isBuffer(c) ? c : Buffer.from(String(c), typeof enc === 'string' ? enc : 'utf8'));

    res.write = function (chunk, enc, cb) {
      if (chunks === null) {
        if (!isHtml()) { restore(); return origWrite.apply(res, arguments); }
        chunks = [];
      }
      if (chunk != null && chunk.length !== 0) chunks.push(toBuf(chunk, enc));
      const done = typeof enc === 'function' ? enc : cb;
      if (typeof done === 'function') done();
      return true;
    };

    res.end = function (chunk, enc, cb) {
      if (chunks === null) {
        if (!isHtml()) { restore(); return origEnd.apply(res, arguments); }
        chunks = [];
      }
      if (typeof chunk === 'function') { cb = chunk; chunk = null; }
      else if (typeof enc === 'function') { cb = enc; enc = undefined; }
      if (chunk != null && chunk.length !== 0) chunks.push(toBuf(chunk, enc));

      const body = Buffer.concat(chunks);
      let html = body.toString('utf8');
      const already = /kievora-theme\.js/i.test(html) || /<meta[^>]+name=["']kv-theme["'][^>]+content=["']off["']/i.test(html);
      if (!already) {
        if (/<head[^>]*>/i.test(html)) html = html.replace(/<head[^>]*>/i, (m) => m + TAG);
        else if (/<html[^>]*>/i.test(html)) html = html.replace(/<html[^>]*>/i, (m) => m + '<head>' + TAG + '</head>');
        else html = TAG + html;
      }
      const out = Buffer.from(html, 'utf8');
      try { res.setHeader('Content-Length', out.length); } catch (e) { /* headers already sent */ }
      restore();
      origWrite.call(res, out);
      return origEnd.call(res, null, null, cb);
    };

    next();
  };
};
