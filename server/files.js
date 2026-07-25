// ═══════════════════════════════════════════════════════════════════════════
// server/files.js — unified "Recent files" history.
//
// Single source of truth for the three buckets the attach panel shows:
//   'upload'       — anything the user attached (incl. Drive imports)
//   'ai_generated'  — files KIE produced (e.g. resume PDFs)
//   'saved'         — files pushed out to Drive via Save to Drive
//
// recordFileHistory() is the one function every other route calls — it's
// exported so drive.js and tools.js hook into it directly server-side
// (more reliable than relying on a client-side fire-and-forget call after
// every possible upload path). The only client-facing route here is the
// plain "Choose File/Photo" attach flow, which has no existing server
// endpoint of its own to hook into — see POST /api/files/record below.
// ═══════════════════════════════════════════════════════════════════════════

const MAX_HISTORY_PER_USER = 30; // "keep it clean and limited" — oldest gets pruned past this

async function recordFileHistory({ admin, db, cloudinary, uid, name, mimeType, buffer, source }) {
  try {
    const upload = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        { folder: `kievora/history/${uid}`, resource_type: 'auto' },
        (err, result) => (err ? reject(err) : resolve(result))
      );
      stream.end(buffer);
    });

    const col = db.collection('users').doc(uid).collection('fileHistory');
    await col.add({
      name: String(name || 'file').slice(0, 150),
      mimeType: mimeType || 'application/octet-stream',
      url: upload.secure_url,
      thumbnailUrl: upload.resource_type === 'image' ? upload.secure_url : null,
      publicId: upload.public_id,
      source: source || 'upload', // 'upload' | 'ai_generated' | 'saved'
      size: buffer.length,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // Prune beyond the cap — best-effort, never blocks the caller.
    const snap = await col.orderBy('createdAt', 'desc').offset(MAX_HISTORY_PER_USER).get();
    const batch = db.batch();
    snap.forEach((doc) => batch.delete(doc.ref));
    if (!snap.empty) await batch.commit();

    return { success: true, url: upload.secure_url };
  } catch (e) {
    console.error('[files] recordFileHistory:', e.message);
    return { success: false }; // never throws — history is a nice-to-have, not critical path
  }
}

module.exports = function registerFilesRoutes(app) {
  const { admin, db, authenticate, cloudinary } = require('./lib');

  // Client-triggered recording — used for the plain attach flow (Choose
  // Photo/File, Take Photo), which doesn't otherwise touch the server.
  app.post('/api/files/record', authenticate, async (req, res) => {
    try {
      const { name, mimeType, base64, source } = req.body;
      if (!name || !base64) return res.status(400).json({ error: 'name and base64 are required' });
      const buffer = Buffer.from(base64, 'base64');
      if (buffer.length > 10 * 1024 * 1024) return res.status(413).json({ error: 'File too large — max 10 MB' });
      const result = await recordFileHistory({
        admin, db, cloudinary, uid: req.user.uid, name, mimeType, buffer, source: source || 'upload',
      });
      res.json(result);
    } catch (e) {
      res.status(500).json({ error: 'Could not record file' });
    }
  });

  app.get('/api/files/recent', authenticate, async (req, res) => {
    try {
      const limit = Math.min(parseInt(req.query.limit, 10) || 20, 30);
      let q = db.collection('users').doc(req.user.uid).collection('fileHistory').orderBy('createdAt', 'desc').limit(limit);
      if (req.query.source) q = q.where('source', '==', req.query.source);
      const snap = await q.get();
      const files = snap.docs.map((d) => ({ id: d.id, ...d.data(), createdAt: d.data().createdAt?.toDate?.()?.toISOString() || null }));
      res.json({ files });
    } catch (e) {
      res.status(500).json({ error: 'Could not load recent files' });
    }
  });

  app.delete('/api/files/:id', authenticate, async (req, res) => {
    try {
      const ref = db.collection('users').doc(req.user.uid).collection('fileHistory').doc(req.params.id);
      const doc = await ref.get();
      if (doc.exists && doc.data().publicId) {
        try { await cloudinary.uploader.destroy(doc.data().publicId, { resource_type: 'auto' }); } catch (_) {}
      }
      await ref.delete();
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: 'Could not delete file' });
    }
  });
};

module.exports.recordFileHistory = recordFileHistory;
