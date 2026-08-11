// ═══════════════════════════════════════════════════════════════════════════
// server/drive.js — Google Drive upload routes.
//
// Free on every plan (unlike Gmail, which is Premier-only).
//
// ONE thing this does: lets a user pick a single existing Drive file and pull
// it into Kievora (chat attach sheet's "Drive" tile). That's it — there is no
// "connect your Google Drive account" step, nothing is stored on our end, and
// no email/identity is captured. Every pick is its own short-lived, one-time
// authorization:
//   1. GET  /api/drive/picker-config — hands the frontend the non-secret bits
//      (OAuth Client ID + Picker API key/App ID) it needs to open Google's
//      Picker widget and request its own access token via Google Identity
//      Services (client-side, scope: drive.file only).
//   2. POST /api/drive/import — takes that access token + the fileId the
//      user picked, fetches the bytes from Drive, hands them back as base64
//      for the client to stage. The token is used once, in this request, and
//      thrown away — nothing is persisted.
//
// Previously this file also had a persistent "Connect Google Drive" flow
// (OAuth connect/callback/status/disconnect + a "save generated files to
// Drive" action) — that's been removed. Uploading is now upload-only.
// ═══════════════════════════════════════════════════════════════════════════

const { google } = require('googleapis');

module.exports = function registerDriveRoutes(app) {
  const {
    authenticate,
    GMAIL_CLIENT_ID, DRIVE_API_KEY, DRIVE_APP_ID,
  } = require('./lib');

  // ─── Picker config ───────────────────────────────────────────────────────
  app.get('/api/drive/picker-config', authenticate, async (req, res) => {
    if (!GMAIL_CLIENT_ID || !DRIVE_API_KEY || !DRIVE_APP_ID) {
      return res.status(503).json({ error: 'Drive picker not configured' });
    }
    res.json({ clientId: GMAIL_CLIENT_ID, apiKey: DRIVE_API_KEY, appId: DRIVE_APP_ID });
  });

  // ─── Import the one picked file ─────────────────────────────────────────
  // Body: { fileId, accessToken } — both required. accessToken is the
  // short-lived, drive.file-only token the frontend got straight from Google
  // Identity Services when the user tapped the Drive tile; it's wrapped in a
  // throwaway OAuth2 client for this one request only, never stored.
  app.post('/api/drive/import', authenticate, async (req, res) => {
    try {
      const { fileId, accessToken } = req.body;
      if (!fileId) return res.status(400).json({ error: 'fileId is required' });
      if (!accessToken) return res.status(400).json({ error: 'accessToken is required' });

      const oauth2 = new google.auth.OAuth2();
      oauth2.setCredentials({ access_token: accessToken });

      const drive = google.drive({ version: 'v3', auth: oauth2 });
      const meta = await drive.files.get({ fileId, fields: 'name, mimeType, size' });
      const dl = await drive.files.get({ fileId, alt: 'media' }, { responseType: 'arraybuffer' });
      const buffer = Buffer.from(dl.data);

      if (buffer.length > 10 * 1024 * 1024) {
        return res.status(413).json({ error: 'File too large — max 10 MB' });
      }

      res.json({
        success: true,
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
