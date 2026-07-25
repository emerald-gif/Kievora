// ════════════════════════════════════════════════════════════════
// GOOGLE DRIVE INTEGRATION — mirrors dashboard-gmail.js's pattern.
// Free on every plan — no lockTapped() gate.
//
// Three entry points into Drive from the rest of the app:
//   1. Settings → Integrations → Google Drive → full #driveIntPanel
//      (openDrivePanel/closeDrivePanel), same shape as Gmail's panel.
//   2. Chat attach sheet → "Google Drive" row → picks a file straight
//      into the chat input (kieAttachSheetDriveTap).
//   3. window.kieSaveToDrive(file, name, mimeType) — callable from any
//      "Download" button anywhere to push a generated file TO Drive.
// ════════════════════════════════════════════════════════════════

let _driveConnected = false;
let _driveEmail = null;
let _driveStatusLoadedAt = 0;
const DRIVE_STATUS_TTL_MS = 5 * 60 * 1000; // 5 min — status barely ever changes mid-session

async function _driveTok() {
  return window.__kieGetIdToken();
}

// force=true always hits the server (used right after connect/disconnect,
// where the cache is known-stale). Otherwise this is a no-op if we loaded
// status recently — avoids a Firestore read every time the attach sheet or
// settings panel is opened, which was happening on every single tap before.
async function _driveLoadStatus(force = false) {
  const fresh = Date.now() - _driveStatusLoadedAt < DRIVE_STATUS_TTL_MS;
  if (!force && fresh && _driveStatusLoadedAt > 0) {
    _driveRenderSettingsRow();
    _driveRenderPanelState();
    return;
  }
  try {
    const tok = await _driveTok();
    const res = await fetch('/api/drive/status', { headers: { Authorization: `Bearer ${tok}` } });
    const data = await res.json();
    _driveConnected = !!data.connected;
    _driveEmail = data.driveEmail || null;
    _driveStatusLoadedAt = Date.now();
  } catch (e) { _driveConnected = false; }
  _driveRenderSettingsRow();
  _driveRenderPanelState();
}

function _driveRenderSettingsRow() {
  const sub = document.getElementById('driveSettingsSub');
  const badge = document.getElementById('driveSettingsBadge');
  if (sub) sub.textContent = _driveConnected ? `Connected — ${_driveEmail || 'your Drive'}` : 'Save resumes & files, or import from Drive';
  if (badge) badge.style.display = _driveConnected ? '' : 'none';
}

function _driveRenderPanelState() {
  const disc = document.getElementById('driveDisconnectedPanel');
  const conn = document.getElementById('driveConnectedPanel');
  const headerBadge = document.getElementById('driveHeaderBadge');
  if (!disc || !conn) return;
  disc.style.display = _driveConnected ? 'none' : '';
  conn.style.display = _driveConnected ? '' : 'none';
  if (headerBadge) headerBadge.style.display = _driveConnected ? 'flex' : 'none';
  const emailLabel = document.getElementById('driveEmailLabel');
  if (emailLabel) emailLabel.textContent = _driveEmail || 'Connected';
}

// Toggles the small green "connected" dot on the Drive tile inside the chat
// attach sheet (dashboard-core.js calls this every time the sheet opens —
// see the hook added there). The tile itself has no subtitle text anymore
// (matches the Camera/Photo/Document tile style), so connection state is
// just this dot instead.
window.kieRefreshDriveAttachTag = function () {
  const dot = document.getElementById('kmdDriveDot');
  if (dot) dot.style.display = _driveConnected ? 'block' : 'none';
};

// ─── Settings panel (full screen, mirrors Gmail's) ───────────────────────
window.kieDriveNudgeTap = function () {
  window.openDrivePanel();
};
window.openDrivePanel = function () {
  const p = document.getElementById('driveIntPanel');
  if (p) p.style.transform = 'translateX(0)';
  document.getElementById('driveImportedCard').style.display = 'none';
  _driveLoadStatus();
};
window.closeDrivePanel = function () {
  const p = document.getElementById('driveIntPanel');
  if (p) p.style.transform = 'translateX(100%)';
};

window.connectDrive = async function () {
  try {
    const tok = await _driveTok();
    const res = await fetch('/api/drive/connect', { method: 'POST', headers: { Authorization: `Bearer ${tok}` } });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Connection failed.');
    window.location.href = data.url;
  } catch (e) {
    if (typeof window.toast === 'function') window.toast('Drive connection failed. Try again.', 'err');
    else alert('Drive connection failed. Try again.');
  }
};

window.disconnectDrive = async function () {
  if (!confirm('Disconnect Google Drive? Kievora will no longer be able to save or import files.')) return;
  try {
    const tok = await _driveTok();
    await fetch('/api/drive/disconnect', { method: 'DELETE', headers: { Authorization: `Bearer ${tok}` } });
    _driveConnected = false; _driveEmail = null; _driveStatusLoadedAt = 0;
    _driveRenderSettingsRow();
    _driveRenderPanelState();
    if (typeof window.toast === 'function') window.toast('Drive disconnected', 'ok');
  } catch (e) {
    if (typeof window.toast === 'function') window.toast('Failed. Try again.', 'err'); else alert('Failed. Try again.');
  }
};

// Picked up automatically on page load — if the OAuth redirect just landed
// back on /dashboard?drive=connected, refresh status and toast it.
(function _driveHandleRedirect() {
  const params = new URLSearchParams(window.location.search);
  const state = params.get('drive');
  if (!state) return;
  params.delete('drive');
  const clean = window.location.pathname + (params.toString() ? `?${params}` : '');
  window.history.replaceState({}, '', clean);
  if (state === 'connected') {
    _driveStatusLoadedAt = 0; // force the next status check to actually hit the server
    if (typeof window.toast === 'function') window.toast('Google Drive connected', 'ok');
  }
  if (state === 'error' && typeof window.toast === 'function') window.toast('Drive connection failed. Try again.', 'err');
})();

document.addEventListener('DOMContentLoaded', () => { _driveLoadStatus(); });

// ─── PICK: bring an existing Drive file INTO the platform ────────────────
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

// Opens Google's own Picker widget and imports whatever the user selects.
// onPicked(result) fires with { url, name, mimeType, base64 } on success —
// callers decide what to do with it (stage into chat, show a card, etc).
window.kiePickFromDrive = async function (onPicked) {
  if (!_driveConnected) { await _driveLoadStatus(); }
  if (!_driveConnected) { await window.connectDrive(); return; }

  try {
    const tok = await _driveTok();
    const res = await fetch('/api/drive/picker-token', { headers: { Authorization: `Bearer ${tok}` } });
    const cfg = await res.json();
    if (!res.ok) throw new Error(cfg.message || cfg.error || 'Could not open Drive picker');

    await _driveLoadGapi();
    const view = new google.picker.DocsView(google.picker.ViewId.DOCS)
      .setIncludeFolders(false)
      .setSelectFolderEnabled(false)
      .setMimeTypes('image/png,image/jpeg,image/webp,application/pdf,text/plain');
    const picker = new google.picker.PickerBuilder()
      .addView(view)
      .setOAuthToken(cfg.accessToken)
      .setDeveloperKey(cfg.apiKey)
      .setAppId(cfg.appId)
      .setCallback(async (data) => {
        if (data.action !== google.picker.Action.PICKED) return;
        const fileId = data.docs[0].id;
        try {
          const tok2 = await _driveTok();
          const importRes = await fetch('/api/drive/import', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok2}` },
            body: JSON.stringify({ fileId }),
          });
          const result = await importRes.json();
          if (!importRes.ok) throw new Error(result.message || result.error || 'Import failed');
          if (window._kieInvalidateRecentFilesCache) window._kieInvalidateRecentFilesCache();
          if (typeof onPicked === 'function') onPicked(result);
        } catch (e) {
          if (typeof window.toast === 'function') window.toast(e.message || 'Import failed', 'err'); else alert(e.message || 'Import failed');
        }
      })
      .build();
    picker.setVisible(true);
  } catch (e) {
    if (typeof window.toast === 'function') window.toast(e.message || 'Could not open Drive picker', 'err'); else alert(e.message || 'Could not open Drive picker');
  }
};

// Used by the "Import a file from Drive" button inside #driveIntPanel —
// stages the file into chat (so it doesn't vanish after import, the bug
// from before) AND shows a small confirmation card right there in the panel.
window.__kieDrivePanelPicked = function (result) {
  const staged = window.kieStageExternalAttachment && window.kieStageExternalAttachment({
    name: result.name, mimeType: result.mimeType, base64: result.base64,
  });
  const card = document.getElementById('driveImportedCard');
  if (card) {
    card.style.display = 'flex';
    card.innerHTML = `
      <div style="width:34px;height:34px;background:#eff6ff;border-radius:9px;display:flex;align-items:center;justify-content:center;flex-shrink:0">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#0066da" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
      </div>
      <div style="min-width:0;flex:1">
        <div style="font-weight:700;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${result.name}</div>
        <div style="font-size:11px;color:#8e8e93">${staged ? 'Ready in your next chat message' : 'Imported to Drive folder'}</div>
      </div>
      <button onclick="closeDrivePanel()" style="background:#7c3aed;color:#fff;border:none;border-radius:9px;padding:8px 12px;font-size:12px;font-weight:700;cursor:pointer;flex-shrink:0">Go to chat</button>
    `;
  }
  if (typeof window.toast === 'function' && staged) window.toast(`${result.name} ready to send`, 'ok');
};

// Tapped from the chat attach sheet's "Google Drive" row.
window.kieAttachSheetDriveTap = async function () {
  if (!_driveConnected) { await _driveLoadStatus(); }
  if (typeof window.closeKieAttachSheet === 'function') window.closeKieAttachSheet();
  if (!_driveConnected) { await window.connectDrive(); return; }
  window.kiePickFromDrive(function (result) {
    const staged = window.kieStageExternalAttachment && window.kieStageExternalAttachment({
      name: result.name, mimeType: result.mimeType, base64: result.base64,
    });
    if (staged && typeof window.toast === 'function') window.toast(`${result.name} attached`, 'ok');
  });
};

// ─── SAVE: "type a name, get the file + preview" ──────────────────────────
// Accepts either a Blob or an already-base64 string. Unrelated to the
// import flow above — this pushes a platform-generated file TO Drive.
function _driveCloseModal() {
  const el = document.getElementById('kieDriveModal');
  if (el) el.remove();
}
function _driveOpenModal(innerHtml) {
  _driveCloseModal();
  const wrap = document.createElement('div');
  wrap.id = 'kieDriveModal';
  wrap.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(15,15,20,.45);display:flex;align-items:center;justify-content:center;padding:20px';
  wrap.onclick = (e) => { if (e.target === wrap) _driveCloseModal(); };
  wrap.innerHTML = `<div style="background:#fff;border-radius:16px;max-width:380px;width:100%;padding:22px;box-shadow:0 20px 60px rgba(0,0,0,.25)">${innerHtml}</div>`;
  document.body.appendChild(wrap);
  return wrap;
}

function _driveToBase64(fileData) {
  return new Promise((resolve, reject) => {
    if (typeof fileData === 'string') { resolve(fileData.includes(',') ? fileData.split(',').pop() : fileData); return; }
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',').pop());
    reader.onerror = reject;
    reader.readAsDataURL(fileData);
  });
}

window.kieSaveToDrive = async function (fileData, suggestedName, mimeType) {
  if (!_driveConnected) { await _driveLoadStatus(); }
  if (!_driveConnected) {
    _driveOpenModal(`
      <div style="font-weight:800;font-size:15px;margin-bottom:6px">Connect Google Drive</div>
      <div style="font-size:13px;color:#64748b;margin-bottom:16px">Connect your Drive to save files straight from Kievora.</div>
      <button onclick="_driveCloseModal();window.connectDrive();" style="width:100%;padding:11px;border-radius:10px;border:none;background:#0066da;color:#fff;font-weight:700;font-size:13px;cursor:pointer">Connect →</button>
    `);
    return;
  }

  const base64 = await _driveToBase64(fileData);
  const modal = _driveOpenModal(`
    <div style="font-weight:800;font-size:15px;margin-bottom:14px">Save to Drive</div>
    <input id="kieDriveNameInput" type="text" value="${(suggestedName || 'file').replace(/"/g, '&quot;')}"
      style="width:100%;padding:10px 12px;border-radius:9px;border:1.5px solid #e2e8f0;font-size:14px;margin-bottom:14px;box-sizing:border-box" />
    <div id="kieDriveModalFoot" style="display:flex;gap:8px">
      <button onclick="_driveCloseModal()" style="flex:1;padding:10px;border-radius:9px;border:1.5px solid #e2e8f0;background:#fff;font-weight:700;font-size:13px;cursor:pointer">Cancel</button>
      <button id="kieDriveSaveBtn" style="flex:1;padding:10px;border-radius:9px;border:none;background:#0066da;color:#fff;font-weight:700;font-size:13px;cursor:pointer">Save</button>
    </div>
  `);

  document.getElementById('kieDriveSaveBtn').onclick = async () => {
    const nameInput = document.getElementById('kieDriveNameInput');
    const name = (nameInput.value || suggestedName || 'file').trim();
    const btn = document.getElementById('kieDriveSaveBtn');
    btn.textContent = 'Saving…'; btn.disabled = true; btn.style.opacity = '.7';
    try {
      const tok = await _driveTok();
      const res = await fetch('/api/drive/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok}` },
        body: JSON.stringify({ filename: name, mimeType: mimeType || 'application/pdf', base64 }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || data.error || 'Save failed');
      if (window._kieInvalidateRecentFilesCache) window._kieInvalidateRecentFilesCache();
      modal.querySelector('div').innerHTML = `
        <div style="font-weight:800;font-size:15px;margin-bottom:14px">Saved to Drive</div>
        <div style="display:flex;align-items:center;gap:10px;padding:12px;border:1.5px solid #e2e8f0;border-radius:10px;margin-bottom:14px">
          ${data.thumbnailLink ? `<img src="${data.thumbnailLink}" style="width:44px;height:44px;object-fit:cover;border-radius:6px" />` : `<img src="${data.iconLink || ''}" style="width:28px;height:28px" />`}
          <div style="min-width:0">
            <div style="font-weight:700;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${data.name}</div>
            <div style="font-size:11px;color:#64748b">Saved to your Drive</div>
          </div>
        </div>
        <a href="${data.webViewLink}" target="_blank" rel="noopener" style="display:block;text-align:center;width:100%;padding:10px;border-radius:9px;background:#0066da;color:#fff;font-weight:700;font-size:13px;text-decoration:none;box-sizing:border-box">Open in Drive →</a>
      `;
    } catch (e) {
      btn.textContent = 'Save'; btn.disabled = false; btn.style.opacity = '1';
      if (e.message === 'reauth_required') { _driveConnected = false; _driveRenderSettingsRow(); }
      if (typeof window.toast === 'function') window.toast(e.message || 'Save failed', 'err'); else alert(e.message || 'Save failed');
    }
  };
};
