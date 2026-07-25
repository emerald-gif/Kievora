// ═══════════════════════════════════════════════════════════════════════════
// server/drive.js — Google Drive integration routes.
//
// Free on every plan (unlike Gmail, which is Premier-only) — see
// getUserPlanKey below is intentionally NOT used to gate anything here.
//
// Two directions of file movement, both built on the narrow 'drive.file'
// scope (see lib.js for why):
//   1. SAVE  — platform-generated files (resumes, cover letters, etc.) get
//      pushed to the user's Drive. POST /api/drive/save.
//   2. PICK  — the user picks an existing Drive file via Google's own
//      Picker widget (runs client-side, never touches our server for
//      browsing) and we pull just that one file in. GET /api/drive/picker-
//      token hands the frontend a short-lived access token to launch the
//      widget; POST /api/drive/import fetches the chosen fileId's bytes.
// ═══════════════════════════════════════════════════════════════════════════

const { google } = require('googleapis');

module.exports = function registerDriveRoutes(app) {
  const {
    admin, db, authenticate, getDriveOAuthClient,
    GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, DRIVE_API_KEY, DRIVE_APP_ID,
    cloudinary,
  } = require('./lib');
  const { recordFileHistory } = require('./files');

  const DRIVE_SCOPE = ['https://www.googleapis.com/auth/drive.file',
                        'https://www.googleapis.com/auth/userinfo.email'];

  async function getStoredTokens(uid) {
    const snap = await db.collection('users').doc(uid).collection('driveBrain').doc('tokens').get();
    return snap.exists ? snap.data().tokens : null;
  }

  // Returns an OAuth2 client with valid (auto-refreshed) credentials for uid,
  // or null if not connected. Mirrors the same refresh-and-persist pattern
  // used for Gmail in lib.js's getValidTokens.
  async function getDriveClientFor(uid) {
    const tokens = await getStoredTokens(uid);
    if (!tokens) return null;
    const oauth2 = getDriveOAuthClient();
    oauth2.setCredentials(tokens);
    oauth2.on('tokens', async (fresh) => {
      const merged = { ...tokens, ...fresh };
      await db.collection('users').doc(uid).collection('driveBrain').doc('tokens')
        .set({ tokens: merged, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
    });
    return oauth2;
  }

  // ─── Connect ───────────────────────────────────────────────────────────
  app.post('/api/drive/connect', authenticate, async (req, res) => {
    if (!GMAIL_CLIENT_ID || !GMAIL_CLIENT_SECRET) return res.status(503).json({ error: 'Drive not configured' });
    const url = getDriveOAuthClient().generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: DRIVE_SCOPE,
      state: req.user.uid,
    });
    res.json({ url });
  });

  app.get('/api/drive/callback', async (req, res) => {
    const { code, state: uid, error } = req.query;
    if (error || !code || !uid) return res.redirect('/dashboard?drive=denied');
    try {
      const oauth2 = getDriveOAuthClient();
      const { tokens } = await oauth2.getToken(code);
      oauth2.setCredentials(tokens);
      const oaApi = google.oauth2({ version: 'v2', auth: oauth2 });
      const { data } = await oaApi.userinfo.get();
      const driveEmail = data.email || '';
      await db.collection('users').doc(uid).collection('driveBrain').doc('tokens')
        .set({ tokens, driveEmail, connectedAt: admin.firestore.FieldValue.serverTimestamp(), updatedAt: admin.firestore.FieldValue.serverTimestamp() });
      await db.collection('users').doc(uid).set({ driveConnected: true, driveEmail, driveConnectedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
      res.redirect('/dashboard?drive=connected');
    } catch (e) {
      console.error('[drive] callback:', e.message);
      res.redirect('/dashboard?drive=error');
    }
  });

  app.get('/api/drive/status', authenticate, async (req, res) => {
    try {
      const uSnap = await db.collection('users').doc(req.user.uid).get();
      const u = uSnap.data() || {};
      res.json({ connected: !!u.driveConnected, driveEmail: u.driveEmail || null });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.delete('/api/drive/disconnect', authenticate, async (req, res) => {
    try {
      const uid = req.user.uid;
      const tokens = await getStoredTokens(uid);
      if (tokens) {
        try {
          const oauth2 = getDriveOAuthClient();
          oauth2.setCredentials(tokens);
          await oauth2.revokeCredentials();
        } catch (_) { /* best-effort — revoke can fail if already invalid, that's fine */ }
      }
      await db.collection('users').doc(uid).collection('driveBrain').doc('tokens').delete();
      await db.collection('users').doc(uid).set({ driveConnected: false, driveEmail: admin.firestore.FieldValue.delete() }, { merge: true });
      res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ─── Save a platform file TO Drive ─────────────────────────────────────
  // Body: { filename, mimeType, base64 } — base64 is the raw file bytes.
  // Used for "type a name, get the file + preview" — the frontend generates
  // the resume PDF (or whatever) client-side/server-side as normal, then
  // hands the bytes here instead of triggering a browser download.
  app.post('/api/drive/save', authenticate, async (req, res) => {
    try {
      const uid = req.user.uid;
      const oauth2 = await getDriveClientFor(uid);
      if (!oauth2) return res.status(409).json({ error: 'not_connected', message: 'Connect Google Drive first.' });

      const { filename, mimeType, base64 } = req.body;
      if (!filename || !base64) return res.status(400).json({ error: 'filename and base64 are required' });

      const safeName = String(filename).replace(/[\/\\]/g, '-').slice(0, 150);
      const buffer = Buffer.from(base64, 'base64');
      if (buffer.length > 25 * 1024 * 1024) return res.status(413).json({ error: 'File too large (25MB max)' });

      const drive = google.drive({ version: 'v3', auth: oauth2 });
      const { Readable } = require('stream');
      const file = await drive.files.create({
        requestBody: { name: safeName, mimeType: mimeType || 'application/octet-stream' },
        media: { mimeType: mimeType || 'application/octet-stream', body: Readable.from(buffer) },
        fields: 'id, name, webViewLink, iconLink, thumbnailLink, mimeType',
      });

      recordFileHistory({ admin, db, cloudinary, uid, name: safeName, mimeType, buffer, source: 'saved' })
        .catch(() => {}); // never let history logging affect the actual save

      res.json({
        success: true,
        fileId: file.data.id,
        name: file.data.name,
        webViewLink: file.data.webViewLink,
        iconLink: file.data.iconLink,
        thumbnailLink: file.data.thumbnailLink || null,
      });
    } catch (e) {
      console.error('[drive] save:', e.message);
      if (e.code === 401 || /invalid_grant/.test(e.message || '')) {
        return res.status(401).json({ error: 'reauth_required', message: 'Drive connection expired — reconnect it.' });
      }
      res.status(500).json({ error: 'Save to Drive failed. Please try again.' });
    }
  });

  // ─── Picker support (bringing an existing Drive file INTO the platform) ──
  // The Google Picker widget itself is a client-side Google-hosted UI (loaded
  // via https://apis.google.com/js/api.js on the frontend) — it does the
  // searching/browsing entirely inside Google's own UI, so nothing about the
  // user's Drive contents ever passes through our server until they've
  // actually picked one file. This endpoint just hands over what the widget
  // needs to open: a short-lived access token + the public API key/App ID.
  app.get('/api/drive/picker-token', authenticate, async (req, res) => {
    try {
      const oauth2 = await getDriveClientFor(req.user.uid);
      if (!oauth2) return res.status(409).json({ error: 'not_connected', message: 'Connect Google Drive first.' });
      const { token } = await oauth2.getAccessToken();
      if (!token) return res.status(500).json({ error: 'Could not get access token' });
      if (!DRIVE_API_KEY || !DRIVE_APP_ID) return res.status(503).json({ error: 'Picker not configured — set DRIVE_API_KEY and DRIVE_APP_ID' });
      res.json({ accessToken: token, apiKey: DRIVE_API_KEY, appId: DRIVE_APP_ID });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // Body: { fileId } — the id the Picker widget returned after the user
  // selected a file. Downloads it and re-hosts it on Cloudinary (same place
  // every other upload in this app lands), so the rest of the platform can
  // treat it exactly like any other uploaded file.
  app.post('/api/drive/import', authenticate, async (req, res) => {
    try {
      const uid = req.user.uid;
      const oauth2 = await getDriveClientFor(uid);
      if (!oauth2) return res.status(409).json({ error: 'not_connected', message: 'Connect Google Drive first.' });
      const { fileId } = req.body;
      if (!fileId) return res.status(400).json({ error: 'fileId is required' });

      const drive = google.drive({ version: 'v3', auth: oauth2 });
      const meta = await drive.files.get({ fileId, fields: 'name, mimeType, size' });
      const dl = await drive.files.get({ fileId, alt: 'media' }, { responseType: 'arraybuffer' });
      const buffer = Buffer.from(dl.data);

      if (buffer.length > 10 * 1024 * 1024) {
        return res.status(413).json({ error: 'File too large — max 10 MB' });
      }

      const upload = await recordFileHistory({
        admin, db, cloudinary, uid, name: meta.data.name, mimeType: meta.data.mimeType, buffer, source: 'upload',
      });
      if (!upload.success) return res.status(500).json({ error: 'Import from Drive failed. Please try again.' });

      res.json({
        success: true,
        url: upload.url,
        name: meta.data.name,
        mimeType: meta.data.mimeType,
        base64: buffer.toString('base64'),
      });
    } catch (e) {
      console.error('[drive] import:', e.message);
      res.status(500).json({ error: 'Import from Drive failed. Please try again.' });
    }
  });
};
