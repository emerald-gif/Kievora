(function(){
  function fmtDate(iso) {
    if (!iso) return '';
    try { return new Date(iso).toLocaleDateString('en-US',{month:'short',day:'numeric'}); } catch { return ''; }
  }

  // Same sanitise-and-render logic as find-jobs — handles both HTML and plain text from providers
  function renderDesc(el, raw) {
    if (!raw) { el.innerHTML = '<p style="color:#94a3b8;font-size:12px">No description available.</p>'; return; }
    const isHtml = /<\s*(p|ul|ol|li|br|h[1-6]|div|strong|em|b)\b/i.test(raw);
    if (isHtml) {
      el.innerHTML = raw
        .replace(/<script[\s\S]*?<\/script>/gi,'')
        .replace(/<style[\s\S]*?<\/style>/gi,'')
        .replace(/on\w+="[^"]*"/gi,'')
        .replace(/on\w+='[^']*'/gi,'')
        .replace(/<iframe[\s\S]*?<\/iframe>/gi,'')
        .replace(/style="[^"]*"/gi,'');
    } else {
      el.innerHTML = raw.split(/\n{2,}/).filter(Boolean)
        .map(p=>`<p>${p.replace(/\n/g,'<br>')}</p>`).join('');
    }
  }

  window.openJobDetail = function(idx, pool) {
    const jobs = pool === 'home' ? (window._homeJobs || []) : (window._fjJobs || []);
    const j = jobs[idx]; if (!j) return;

    // Logo
    const logo = document.getElementById('jdLogo');
    logo.innerHTML = j.logo
      ? `<img src="${j.logo}" alt="${j.company}" style="width:44px;height:44px;object-fit:contain" onerror="this.parentElement.innerHTML='<svg width=&quot;22&quot; height=&quot;22&quot; fill=&quot;none&quot; viewBox=&quot;0 0 24 24&quot; stroke=&quot;#94a3b8&quot; stroke-width=&quot;1.5&quot;><rect x=&quot;2&quot; y=&quot;7&quot; width=&quot;20&quot; height=&quot;14&quot; rx=&quot;2&quot;/><path stroke-linecap=&quot;round&quot; d=&quot;M16 7V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v2&quot;/></svg>'">`
      : `<svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="#94a3b8" stroke-width="1.5"><rect x="2" y="7" width="20" height="14" rx="2"/><path stroke-linecap="round" d="M16 7V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v2"/></svg>`;

    document.getElementById('jdCompany').textContent = j.company || '';
    document.getElementById('jdTitle').textContent   = j.title   || '';

    // Pills
    const meta = [];
    if (j.location) meta.push(`<span class="jd-pill blue"><svg width="11" height="11" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M17.657 16.657L13.414 20.9a2 2 0 01-2.828 0l-4.243-4.243a8 8 0 1111.314 0z"/><circle cx="12" cy="11" r="3"/></svg>${j.location}</span>`);
    if (j.remote)   meta.push(`<span class="jd-pill green">🌐 Remote</span>`);
    if (j.type)     meta.push(`<span class="jd-pill">${j.type}</span>`);
    if (j.salary)   meta.push(`<span class="jd-pill yellow">💰 ${j.salary}</span>`);
    if (j.posted)   meta.push(`<span class="jd-pill">📅 ${fmtDate(j.posted)}</span>`);
    document.getElementById('jdMeta').innerHTML = meta.join('');

    // Description — rendered properly
    renderDesc(document.getElementById('jdDesc'), j.description || j.snippet);

    // Adzuna's API only ever returns a truncated snippet — point people to the
    // original posting instead of pretending we have the full description.
    if (j.source === 'Adzuna' && j.url) {
      document.getElementById('jdDesc').insertAdjacentHTML('beforeend',
        `<p style="margin-top:10px"><a href="${j.url}" target="_blank" rel="noopener" style="color:#7c3aed;font-weight:700;text-decoration:none">View full listing on ${j.company || 'company site'} →</a></p>`);
    }

    // Requirements
    const reqEl   = document.getElementById('jdRequirements');
    const reqBody = document.getElementById('jdReqContent');
    if (j.requirements) { reqEl.style.display=''; renderDesc(reqBody, j.requirements); }
    else { reqEl.style.display='none'; }

    // Apply button
    const btn = document.getElementById('jdApplyBtn');
    if (j.url) {
      btn.href = j.url; btn.className = 'jd-apply';
      btn.onclick = null; btn.textContent = 'Apply for this role →';
    } else {
      btn.removeAttribute('href'); btn.className = 'jd-apply locked';
      btn.onclick = () => { if(typeof window.lockTapped==='function') window.lockTapped('findJobs'); };
      btn.textContent = '🔒 Upgrade to apply';
    }

    // "Listed via" — replaces the old generic source line
    const srcEl = document.getElementById('jdSource');
    if (srcEl) srcEl.innerHTML = j.source
      ? `Curated by Kievora · <span style="background:#f5f3ff;border:1.5px solid #ddd6fe;color:#7c3aed;border-radius:20px;padding:2px 9px;font-size:9.5px;font-weight:800;letter-spacing:.2px">Listed via ${j.source}</span>`
      : '';

    document.getElementById('jobDetailDrawer').classList.add('open');
    document.getElementById('jobDetailSheet').scrollTop = 0;
    document.body.style.overflow = 'hidden';
  };

  window.closeJobDetail = function() {
    document.getElementById('jobDetailDrawer').classList.remove('open');
    document.body.style.overflow = '';
  };

  // Swipe down to close
  let _touchY = 0;
  document.getElementById('jobDetailSheet').addEventListener('touchstart', e => { _touchY = e.touches[0].clientY; }, { passive: true });
  document.getElementById('jobDetailSheet').addEventListener('touchend', e => {
    if (e.changedTouches[0].clientY - _touchY > 60) window.closeJobDetail();
  }, { passive: true });
})();
