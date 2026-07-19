// ─── Weekly Job Alerts Cron ─────────────────────────────────────────────────
// Runs alongside the existing Gmail digest cron (see the setInterval in
// lib.js). Every 2 hours it checks whether it's alert day (Sunday UTC, same
// day as the Gmail digest so people aren't getting Kievora emails on
// scattered days) and, for each user who's turned on Job Alerts in
// account.html, runs their saved search and emails up to JOBS_PER_ALERT
// matches via Brevo template 5.
//
// Requires server/tools.js's registerToolsRoutes(app) to have already run at
// boot (server/index.js does this before requiring this file) so that
// registerToolsRoutes.findJobsCore is available — see the export at the
// bottom of the /api/find-jobs section in tools.js.

const { db, admin, getWeekKey, sendJobAlertEmail } = require('./lib');
const registerToolsRoutes = require('./tools');

const JOBS_PER_ALERT = 10;
const APP_URL = process.env.APP_URL || 'https://kievora.app';

function buildFindJobsUrl(title, countryCode) {
  const params = new URLSearchParams({ q: title || '', country: countryCode || 'worldwide' });
  return `${APP_URL}/find-jobs?${params.toString()}`;
}

async function runJobAlertsForUser(uid, u) {
  const alert = u.jobAlert;
  if (!alert || !alert.enabled || !alert.title) return;

  const findJobsCore = registerToolsRoutes.findJobsCore;
  if (typeof findJobsCore !== 'function') {
    console.error('[job-alerts] findJobsCore not available — tools.js routes may not be registered yet');
    return;
  }

  try {
    const jobs = await findJobsCore(alert.title, alert.countryCode || 'worldwide', '', JOBS_PER_ALERT);
    if (!jobs.length) {
      console.log(`[job-alerts] uid:${uid} — 0 matches for "${alert.title}" in ${alert.countryName||alert.countryCode}, skipping send`);
      return;
    }
    const findJobsUrl = buildFindJobsUrl(alert.title, alert.countryCode);
    const fullName  = u.name || u.displayName || '';
    const firstName = fullName.trim().split(/\s+/)[0] || '';
    const sent = await sendJobAlertEmail(u.email, firstName, jobs, alert.title, alert.countryName || '', findJobsUrl);
    if (sent) {
      await db.collection('users').doc(uid).set({ lastJobAlertWeek: getWeekKey() }, { merge: true }).catch(() => {});
    }
  } catch (e) {
    console.error(`[job-alerts] uid:${uid}:`, e.message);
  }
}

setInterval(async () => {
  try {
    const isAlertDay = new Date().getUTCDay() === 0; // Sunday, UTC — same day as the Gmail digest
    if (!isAlertDay) return;
    const weekKey = getWeekKey();

    const snap = await db.collection('users').where('jobAlert.enabled', '==', true).limit(200).get();
    for (const doc of snap.docs) {
      const u = doc.data();
      if (u.lastJobAlertWeek === weekKey) continue; // already sent this week
      if (!u.email) continue;
      await runJobAlertsForUser(doc.id, u);
      await new Promise(r => setTimeout(r, 1500)); // stay well under API rate limits across sources
    }
  } catch (e) {
    console.error('[job-alerts-cron]:', e.message);
  }
}, 2 * 60 * 60 * 1000);

console.log('✅ Job alerts cron scheduled (weekly, Sunday UTC)');

module.exports = { runJobAlertsForUser, buildFindJobsUrl };
