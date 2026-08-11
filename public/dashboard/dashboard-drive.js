// ════════════════════════════════════════════════════════════════
// GOOGLE DRIVE — UPLOAD ONLY.
//
// One entry point: the chat attach sheet's "Google Drive" tile
// (kmdDriveItem in dashboard-core.js) → window.kieAttachSheetDriveTap().
// Tapping it asks Google Identity Services for a one-off, drive.file-only
// access token (a normal Google popup — account picker + a plain "this app
// wants to see the files you select" consent, not a Kievora "connect" step),
// opens the Picker with it, imports whatever single file the user chose, and
// throws the token away. Nothing is stored on our end, no email is captured,
// there's no persistent "connected" state — same shape as tapping Camera,
// Photo, or Document in that same sheet.
//
// Previously this file also had a persistent "Connect Google Drive" flow
// (Settings > Integrations panel, save-generated-files-to-Drive) — that has
// been removed. Uploading is the only thing this feature does now.
// ════════════════════════════════════════════════════════════════

async function _driveTok() {
  return window.__kieGetIdToken();
}

let _gapiLoaded = false;
function _driveLoadGapi() {
  return new Promise((resolve, reject) => {
    if (_gapiLoaded && window.gapi && window.google?.picker) return resolve();
    const s = document.createElement('script');
    s.src = 'https://apis.google.com/js/api.js';
    s.onload = () => { window.gapi.load('picker', () => { _gapiLoaded = true; resolve(); }); };
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

let _gisLoaded = false;
function _driveLoadGis() {
  return new Promise((resolve, reject) => {
    if (_gisLoaded && window.google?.accounts?.oauth2) return resolve();
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.onload = () => { _gisLoaded = true; resolve(); };
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

function _driveOpenPickerWithToken(accessToken, cfg, onPicked) {
  const pickerW = Math.round(Math.min(window.innerWidth * 0.94, 560));
  const pickerH = Math.round(Math.min(window.innerHeight * 0.78, 640));
  const view = new google.picker.DocsView(google.picker.ViewId.DOCS)
    .setIncludeFolders(false)
    .setSelectFolderEnabled(false)
    .setMimeTypes('image/png,image/jpeg,image/webp,application/pdf,text/plain');
  const picker = new google.picker.PickerBuilder()
    .addView(view)
    .setOAuthToken(accessToken)
    .setDeveloperKey(cfg.apiKey)
    .setAppId(cfg.appId)
    .setSize(pickerW, pickerH)
    .setCallback(async (data) => {
      if (data.action !== google.picker.Action.PICKED) return;
      const fileId = data.docs[0].id;
      try {
        const tok = await _driveTok();
        const importRes = await fetch('/api/drive/import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok}` },
          body: JSON.stringify({ fileId, accessToken }),
        });
        const result = await importRes.json();
        if (!importRes.ok) throw new Error(result.message || result.error || 'Import failed');
        if (typeof onPicked === 'function') onPicked(result);
      } catch (e) {
        if (typeof window.toast === 'function') window.toast(e.message || 'Import failed', 'err'); else alert(e.message || 'Import failed');
      }
    })
    .build();
  picker.setVisible(true);
}

// Tapped from the chat attach sheet's "Google Drive" row.
window.kieAttachSheetDriveTap = async function () {
  if (typeof window.closeKieAttachSheet === 'function') window.closeKieAttachSheet();
  try {
    const tok = await _driveTok();
    const cfgRes = await fetch('/api/drive/picker-config', { headers: { Authorization: `Bearer ${tok}` } });
    const cfg = await cfgRes.json();
    if (!cfgRes.ok) throw new Error(cfg.message || cfg.error || 'Drive is not set up yet');

    await Promise.all([_driveLoadGis(), _driveLoadGapi()]);

    const client = google.accounts.oauth2.initTokenClient({
      client_id: cfg.clientId,
      scope: 'https://www.googleapis.com/auth/drive.file',
      callback: (resp) => {
        if (!resp || resp.error || !resp.access_token) return;
        _driveOpenPickerWithToken(resp.access_token, cfg, function (result) {
          const staged = window.kieStageExternalAttachment && window.kieStageExternalAttachment({
            name: result.name, mimeType: result.mimeType, base64: result.base64,
          });
          if (staged && typeof window.toast === 'function') window.toast(`${result.name} attached`, 'ok');
        });
      },
    });
    client.requestAccessToken();
  } catch (e) {
    if (typeof window.toast === 'function') window.toast(e.message || 'Could not open Drive picker', 'err'); else alert(e.message || 'Could not open Drive picker');
  }
};
