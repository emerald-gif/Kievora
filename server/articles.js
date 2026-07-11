// ═══════════════════════════════════════════════════════════════════════════
// server-articles.js — Articles / Community module (follow, feed, submissions,
// profile & article pages).
//
// This is the whole "social" side of Kievora — following, the following-feed,
// article submission review, and the article/profile/insights pages. It is
// NOT part of the core AI career-coach + resume-builder product and is not
// being launched yet (nav to it is already hidden on the dashboard).
//
// Kept as its own module so it can be switched on with one flag in server.js
// (ENABLE_ARTICLES) whenever the community feature is ready to launch —
// nothing else in the app depends on these routes.
//
// Usage (in server.js):
//   if (ENABLE_ARTICLES) require('./server-articles')(app, { admin, db, authenticate });
// ═══════════════════════════════════════════════════════════════════════════
const path = require('path');

module.exports = function registerArticleRoutes(app, { admin, db, authenticate }) {

  // ─── Follow + Following-Feed ─────────────────────────────────────────────
  // ─── POST /api/follow ──────────────────────────────────────────────────────────
  // Atomically writes/deletes the follow doc AND updates followerCount + followingCount
  // on both user docs. Admin SDK bypasses client-side Firestore rules so cross-user
  // field updates are safe.
  app.post('/api/follow', authenticate, async (req, res) => {
    const followerId  = req.user.uid;
    const { followingId, action } = req.body; // action: 'follow' | 'unfollow'
    if (!followingId || !['follow','unfollow'].includes(action)) {
      return res.status(400).json({ error: 'Missing followingId or invalid action' });
    }
    if (followerId === followingId) {
      return res.status(400).json({ error: 'Cannot follow yourself' });
    }
    try {
      const followDocId  = `${followerId}_${followingId}`;
      const followRef    = db.collection('follows').doc(followDocId);
      const followerRef  = db.collection('users').doc(followingId); // person being followed
      const followingRef = db.collection('users').doc(followerId);  // person doing the following
      const delta = action === 'follow' ? 1 : -1;
      const batch = db.batch();
      if (action === 'follow') {
        batch.set(followRef, {
          followerId,
          followingId,
          createdAt: admin.firestore.FieldValue.serverTimestamp()
        });
      } else {
        batch.delete(followRef);
      }
      batch.set(followerRef,  { followerCount:  admin.firestore.FieldValue.increment(delta) }, { merge: true });
      batch.set(followingRef, { followingCount: admin.firestore.FieldValue.increment(delta) }, { merge: true });
      await batch.commit();

      // Bust the following-feed cache for the follower so their feed refreshes
      bustFeedCache(followerId);

      res.json({ success: true, action });
    } catch (err) {
      console.error('POST /api/follow ERROR:', err.message);
      res.status(500).json({ error: 'Follow action failed: ' + err.message });
    }
  });

  // ─── GET /api/following-feed ───────────────────────────────────────────────────
  // Returns articles from users the caller follows.
  // Results are cached per-user for 5 minutes in memory — so repeated tab opens
  // cost 0 Firestore reads instead of N/10 queries each time.
  //
  // Cache entry: { articles: [...], ts: Date.now() }
  // Invalidated automatically after FEED_CACHE_TTL ms.
  // The cache is also busted when the user follows/unfollows via /api/follow.

  const feedCache   = new Map();   // uid → { articles, ts }
  const FEED_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  function bustFeedCache(uid) {
    feedCache.delete(uid);
  }

  // Sweep expired entries every 10 minutes so the Map never grows unboundedly.
  // Without this, every user who ever opens the Following tab would stay in memory forever.
  setInterval(() => {
    const now = Date.now();
    let swept = 0;
    for (const [uid, entry] of feedCache) {
      if (now - entry.ts > FEED_CACHE_TTL) {
        feedCache.delete(uid);
        swept++;
      }
    }
    if (swept > 0) console.log(`[feed-cache] swept ${swept} expired entries, ${feedCache.size} remaining`);
  }, 10 * 60 * 1000);

  app.get('/api/following-feed', authenticate, async (req, res) => {
    const uid   = req.user.uid;
    const fresh = req.query.fresh === 'true';

    // ── 1. Serve from cache if fresh ──────────────────────────────────────────
    if (!fresh) {
      const cached = feedCache.get(uid);
      if (cached && Date.now() - cached.ts < FEED_CACHE_TTL) {
        return res.json({ articles: cached.articles, followedUids: cached.followedUids || [], fromCache: true });
      }
    } else {
      // Force bust so the new result overwrites stale cache
      feedCache.delete(uid);
    }

    try {
      // ── 2. Get followed UIDs ────────────────────────────────────────────────
      const followsSnap = await db.collection('follows')
        .where('followerId', '==', uid)
        .get();

      const followedUids = followsSnap.docs
        .map(d => d.data().followingId)
        .filter(Boolean);

      if (!followedUids.length) {
        // Cache the empty result too — no point re-querying follows collection every tab open
        feedCache.set(uid, { articles: [], followedUids: [], ts: Date.now() });
        return res.json({ articles: [], followedUids: [], fromCache: false });
      }

      // ── 3. Chunk into groups of 10 (Firestore `in` limit) ──────────────────
      const chunks = [];
      for (let i = 0; i < followedUids.length; i += 10) {
        chunks.push(followedUids.slice(i, i + 10));
      }

      // ── 4. Run all chunk queries in parallel (not sequential) ───────────────
      const chunkResults = await Promise.all(
        chunks.map(chunk =>
          db.collection('articles')
            .where('authorUid', 'in', chunk)
            .where('status', '==', 'published')
            .orderBy('createdAt', 'desc')
            .limit(20)
            .get()
            .catch(e => { console.warn('following-feed chunk err:', e.message); return null; })
        )
      );

      // ── 5. Merge + sort + dedupe ────────────────────────────────────────────
      const seen    = new Set();
      const articles = [];
      chunkResults.forEach(snap => {
        if (!snap) return;
        snap.docs.forEach(d => {
          if (seen.has(d.id)) return;
          seen.add(d.id);
          const data = d.data();
          articles.push({
            id:          d.id,
            title:       data.title       || '',
            brief:       data.brief       || data.excerpt || '',
            cat:         data.cat         || data.category || '',
            img:         data.img         || data.coverImage || '',
            author:      data.author      || data.authorName || '',
            authorUid:   data.authorUid   || '',
            avatar:      data.avatar      || data.authorPhoto || '',
            read:        data.read        || '',
            // Send createdAt as plain seconds so client doesn't need Firestore SDK to parse it
            createdAt:   data.createdAt   ? { seconds: data.createdAt._seconds || data.createdAt.seconds || 0 } : null,
            status:      data.status      || '',
          });
        });
      });

      articles.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));

      // ── 6. Store in cache ───────────────────────────────────────────────────
      feedCache.set(uid, { articles, followedUids, ts: Date.now() });

      res.json({ articles, followedUids, fromCache: false });

    } catch (err) {
      console.error('GET /api/following-feed ERROR:', err.message);
      res.status(500).json({ error: 'Could not load feed: ' + err.message });
    }
  });


  // ─── Admin: Article Submission Review ────────────────────────────────────
  // ─── POST /api/approve-submission ─────────────────────────────────────────────
  // Admin-only. Atomically:
  //   1. Copies the submission to `articles` with status:'published'
  //      — remaps userId → authorUid, stores authorUsername for @username nav
  //   2. Updates the submission doc → status:'approved'
  //   3. Busts the author's feed cache so followers see the article immediately
  app.post('/api/approve-submission', authenticate, async (req, res) => {
    const callerUid = req.user.uid;
    try {
      const adminDoc = await db.collection('admins').doc(callerUid).get();
      if (!adminDoc.exists) return res.status(403).json({ error: 'Forbidden: admin access required.' });
    } catch {
      return res.status(403).json({ error: 'Could not verify admin status.' });
    }

    const { submissionId, reviewNote = '' } = req.body;
    if (!submissionId) return res.status(400).json({ error: 'submissionId is required.' });

    try {
      const subRef  = db.collection('submissions').doc(submissionId);
      const subSnap = await subRef.get();
      if (!subSnap.exists) return res.status(404).json({ error: 'Submission not found.' });

      const sub = subSnap.data();
      if (sub.status === 'approved') return res.status(409).json({ error: 'Already approved.' });

      const now = admin.firestore.FieldValue.serverTimestamp();

      const articleDoc = {
        id:             submissionId,
        title:          sub.title          || '',
        brief:          sub.brief          || '',
        body:           sub.body           || '',
        cat:            sub.cat            || 'CAREERS',
        cover:          sub.cover          || '',
        readTime:       sub.readTime       || '5 min read',
        // Both field names kept — userId for backward compat, authorUid for following-feed query
        userId:         sub.userId         || '',
        authorUid:      sub.userId         || '',
        authorName:     sub.authorName     || '',
        authorPhoto:    sub.authorPhoto    || '',
        authorUsername: sub.authorUsername || '',   // needed for @username nav in article-read
        authorBio:      sub.authorBio      || '',
        status:         'published',
        publishedAt:    now,
        createdAt:      sub.createdAt      || now,
        likes:          0,
        saves:          0,
      };

      const batch = db.batch();
      batch.set(db.collection('articles').doc(submissionId), articleDoc);
      batch.update(subRef, {
        status:     'approved',
        reviewNote: reviewNote,
        approvedAt: now,
        approvedBy: callerUid,
      });
      await batch.commit();

      // Bust author's feed cache so followers see the new article immediately
      bustFeedCache(sub.userId);

      console.log(`✅ /api/approve-submission — id:${submissionId} author:${sub.userId} by:${callerUid}`);
      res.json({ success: true, articleId: submissionId });

    } catch (err) {
      console.error('POST /api/approve-submission ERROR:', err.message);
      res.status(500).json({ error: 'Approval failed: ' + err.message });
    }
  });

  // ─── POST /api/reject-submission ──────────────────────────────────────────────
  // Admin-only. Updates submission status → 'rejected' with a review note.
  app.post('/api/reject-submission', authenticate, async (req, res) => {
    const callerUid = req.user.uid;
    try {
      const adminDoc = await db.collection('admins').doc(callerUid).get();
      if (!adminDoc.exists) return res.status(403).json({ error: 'Forbidden: admin access required.' });
    } catch {
      return res.status(403).json({ error: 'Could not verify admin status.' });
    }

    const { submissionId, reviewNote = '' } = req.body;
    if (!submissionId) return res.status(400).json({ error: 'submissionId is required.' });

    try {
      const subRef  = db.collection('submissions').doc(submissionId);
      const subSnap = await subRef.get();
      if (!subSnap.exists) return res.status(404).json({ error: 'Submission not found.' });

      await subRef.update({
        status:     'rejected',
        reviewNote: reviewNote,
        rejectedAt: admin.firestore.FieldValue.serverTimestamp(),
        rejectedBy: callerUid,
      });

      console.log(`❌ /api/reject-submission — id:${submissionId} by:${callerUid}`);
      res.json({ success: true });

    } catch (err) {
      console.error('POST /api/reject-submission ERROR:', err.message);
      res.status(500).json({ error: 'Rejection failed: ' + err.message });
    }
  });

  // ─── GET /api/admin/submissions ───────────────────────────────────────────────
  // Admin-only. Returns submissions filtered by ?status=pending|approved|rejected|all
  app.get('/api/admin/submissions', authenticate, async (req, res) => {
    const callerUid = req.user.uid;
    try {
      const adminDoc = await db.collection('admins').doc(callerUid).get();
      if (!adminDoc.exists) return res.status(403).json({ error: 'Forbidden.' });
    } catch {
      return res.status(403).json({ error: 'Could not verify admin status.' });
    }

    const status = req.query.status || 'pending';
    try {
      let q = db.collection('submissions').orderBy('createdAt', 'desc');
      if (status !== 'all') q = q.where('status', '==', status);
      const snap = await q.limit(100).get();
      const submissions = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      res.json({ submissions });
    } catch (err) {
      console.error('GET /api/admin/submissions ERROR:', err.message);
      res.status(500).json({ error: 'Could not load submissions: ' + err.message });
    }
  });


  // ─── Article / Community Page Routes ──────────────────────────────────────
  app.get('/articles',  (_req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'articles.html')));
  app.get('/article-read', (_req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'article-read.html')));
  app.get('/seed-articles', (_req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'seed-articles.html')));
  app.get('/write',     (_req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'write.html')));
  app.get('/insights',  (_req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'insights.html')));
  app.get('/kievora-profile', (_req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'kievora-profile.html')));
  // ─── Clean profile URLs: /profile  or  /profile/@username ─────────────────────
  app.get('/profile',   (_req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'profile.html')));
  app.get('/profile/@:username', (_req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'profile.html')));

}; // end registerArticleRoutes
