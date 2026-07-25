// ════════════════════════════════════════════════════════════════
// GOOGLE DRIVE INTEGRATION — all functions at global scope, mirrors the
// dashboard-gmail.js pattern. Free on every plan — no lockTapped() gate.
//
// Two things this file gives the rest of the app:
//   window.kieSaveToDrive(blob|base64, suggestedName, mimeType)
//     → shows a "type a name" modal, uploads, shows file + preview.
//     Call this from any "Download" button anywhere in the platform.
//   window.kiePickFromDrive(onPicked)
//     → opens Google's own Picker widget (searches/browses inside
//     Google's UI, not ours), imports the chosen file, calls
//     onPicked({url, name, mimeType}).
// ════════════════════════════════════════════════════════════════

let _driveConnected = false;
let _driveEmail = null;

async function _driveTok() {
  return window.__kieGetIdToken();
}

async function _driveLoadStatus() {
  try {
    const tok = await _driveTok();
    const res = await fetch('/api/drive/status', { headers: { Authorization: `Bearer ${tok}` } });
    const data = await res.json();
    _driveConnected = !!data.connected;
    _driveEmail = data.driveEmail || null;
  } catch (e) { _driveConnected = false; }
  _driveRenderSettingsRow();
}

function _driveRenderSettingsRow() {
  const sub = document.getElementById('driveSettingsSub');
  const badge = document.getElementById('driveSettingsBadge');
  if (sub) sub.textContent = _driveConnected ? `Connected — ${_driveEmail || 'your Drive'}` : 'Save resumes & files, or import from Drive';
  if (badge) badge.style.display = _driveConnected ? '' : 'none';
}

// Tapped from Settings → Integrations → Google Drive. No plan gate — always
// either connects (if not yet connected) or opens the small manage panel.
window.kieDriveNudgeTap = async function () {
  if (!_driveConnected) await _driveLoadStatus();
  if (_driveConnected) {
    _driveOpenManagePanel();
  } else {
    await window.connectDrive();
  }
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
    _driveConnected = false; _driveEmail = null;
    _driveRenderSettingsRow();
    if (typeof window.toast === 'function') window.toast('Drive disconnected', 'ok');
    _driveCloseModal();
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
  if (state === 'connected' && typeof window.toast === 'function') window.toast('Google Drive connected', 'ok');
  if (state === 'error' && typeof window.toast === 'function') window.toast('Drive connection failed. Try again.', 'err');
})();

document.addEventListener('DOMContentLoaded', () => { _driveLoadStatus(); });

// ─── Shared modal shell (used by both Save and Manage panels) ────────────
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

function _driveOpenManagePanel() {
  _driveOpenModal(`
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px">
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none"><path d="M8.15 3.5L1.6 14.87l3.4 5.9 6.55-11.35L8.15 3.5z" fill="#0066da"/><path d="M15.85 3.5H8.15l3.4 5.92h7.7L15.85 3.5z" fill="#00ac47"/><path d="M12.75 9.42l-6.55 11.35h13.1l3.35-5.9-3.35-5.45h-6.55z" fill="#ffba00"/></svg>
      <div>
        <div style="font-weight:800;font-size:15px">Google Drive</div>
        <div style="font-size:12px;color:#64748b">${_driveEmail || 'Connected'}</div>
      </div>
    </div>
    <button onclick="window.kiePickFromDrive(function(r){ if(typeof window.toast==='function') window.toast('Imported '+r.name,'ok'); }); _driveCloseModal();"
      style="width:100%;padding:11px;border-radius:10px;border:1.5px solid #e2e8f0;background:#f8fafc;font-weight:700;font-size:13px;margin-bottom:8px;cursor:pointer">
      Import a file from Drive
    </button>
    <button onclick="window.disconnectDrive()"
      style="width:100%;padding:11px;border-radius:10px;border:1.5px solid #fecaca;background:#fef2f2;color:#dc2626;font-weight:700;font-size:13px;cursor:pointer">
      Disconnect
    </button>
  `);
}

// ─── SAVE: "type a name, get the file + preview" ──────────────────────────
// Accepts either a Blob or an already-base64 string.
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

function _driveToBase64(fileData) {
  return new Promise((resolve, reject) => {
    if (typeof fileData === 'string') { resolve(fileData.includes(',') ? fileData.split(',').pop() : fileData); return; }
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',').pop());
    reader.onerror = reject;
    reader.readAsDataURL(fileData);
  });
}

// ─── PICK: bring an existing Drive file INTO the platform ────────────────
let _gapiLoaded = false;
function _driveLoadGapi() {
  return new Promise((resolve, reject) => {
    if (_gapiLoaded && window.gapi && window.google?.picker) return resolve();
    const s = document.createElement('script');
    s.src = 'https://apis.google.com/js/api.js';
    s.onload = () => {
      window.gapi.load('picker', () => { _gapiLoaded = true; resolve(); });
    };
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

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
      .setSelectFolderEnabled(false);
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
