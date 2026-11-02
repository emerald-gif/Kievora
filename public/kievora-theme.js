/*! kievora-theme.js v1.0 — MindShift-style indigo → cyan theme engine.
 *
 * Drop this ONE file in /public. The server (server/theme-inject.js) adds it to every page
 * automatically, so no HTML file has to include it. It runs by itself:
 *
 *   1. Re-colors every stylesheet rule (inline <style>, linked CSS, @media, @keyframes …)
 *   2. Re-colors inline style="" attributes and SVG fill / stroke / stop-color
 *   3. Watches the page forever (MutationObserver) so anything added later — modals,
 *      innerHTML, dashboard views, loaded CSS — is re-colored the moment it appears
 *   4. Normalizes the design tokens (--p, --p2, --g, --border …) to the MindShift palette
 *
 * How colors are decided (by hue, not by a fixed list, so nothing slips through):
 *   purple / violet / fuchsia  →  indigo   (#4f46e5 family, lightness kept)
 *   lavender-tinted greys      →  slate
 *   gradient that ends in a purple / pink / light-indigo stop  →  ends in cyan (#06b6d4)
 *   pink 312–345°, greens, ambers, reds, plain greys, white/black  →  left alone
 *
 * Opt out of an area:      <div data-kv-skip> … </div>   (user content is skipped by default)
 * Map a color from JS:     KievoraTheme.mapColor('#7c3aed')  →  '#4f46e5'
 * Re-run after surprises:  KievoraTheme.refresh()
 * Turn off:                set window.KIEVORA_THEME_OFF = true before this script loads
 */
(function () {
  'use strict';
  if (window.KievoraTheme || window.KIEVORA_THEME_OFF) return;

  var CFG = {
    skip: '[data-kv-skip],.kv-skip,[contenteditable="true"],.ql-editor,.resume-preview,#resumePreview',
    slate: true,        // zinc / warm / old-gray neutrals → slate (MindShift neutrals)
    tokens: true,       // normalize --p / --p2 / --g / --border … on :root
    gradientEnd: true,  // brand gradients end in cyan
    tintBlue: true,     // translucent indigo/purple tints (≤ .35 alpha) become clean blue rgba(37,99,235,α)
    extras: true        // accent-color, ::selection, focus caret
  };
  var user = window.KIEVORA_THEME_CONFIG;
  if (user) for (var k in user) CFG[k] = user[k];

  /* ───────────────────────── color math ───────────────────────── */
  function rgb2hsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    var mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, h = 0, s = 0, d = mx - mn;
    if (d) {
      s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
      if (mx === r) h = (g - b) / d + (g < b ? 6 : 0);
      else if (mx === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h *= 60;
    }
    return [h, s, l];
  }
  function hsl2rgb(h, s, l) {
    h = (((h % 360) + 360) % 360) / 360;
    var r, g, b;
    if (!s) { r = g = b = l; }
    else {
      var q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
      var f = function (t) {
        if (t < 0) t += 1; if (t > 1) t -= 1;
        if (t < 1 / 6) return p + (q - p) * 6 * t;
        if (t < 1 / 2) return q;
        if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
        return p;
      };
      r = f(h + 1 / 3); g = f(h); b = f(h - 1 / 3);
    }
    return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
  }
  function hex2(n) { n = Math.max(0, Math.min(255, Math.round(n))); return (n < 16 ? '0' : '') + n.toString(16); }
  function toHex6(r, g, b) { return hex2(r) + hex2(g) + hex2(b); }
  function fromHex6(h) { return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]; }

  /* exact one-to-one swaps for the colors this project actually uses (guarantees the brand anchors) */
  var EXACT = {
    '7c3aed': '4f46e5', '6d28d9': '4338ca', '5b21b6': '3730a3', '4c1d95': '312e81',
    'a855f7': '818cf8', '9333ea': '6366f1', '8b5cf6': '6366f1', 'a78bfa': '818cf8',
    'c4b5fd': 'a5b4fc', 'ddd6fe': 'c7d2fe', 'ede9fe': 'e0e7ff', 'f5f3ff': 'eef2ff',
    'faf5ff': 'f5f7ff', 'f3e8ff': 'e0e7ff', 'e9d5ff': 'c7d2fe', 'd8b4fe': 'a5b4fc',
    'c084fc': '818cf8', '7e22ce': '4338ca', '6b21a8': '3730a3', '581c87': '312e81',
    'f8f7ff': 'f5f7ff', 'ece8f7': 'e0e7ff', '7c1fb0': '4338ca', '4527ce': '3730a3',
    '2e1065': '1e1b4b', 'b085f5': '818cf8', '8b3ce8': '4f46e5',
    'f056aa': '06b6d4', 'ff3dae': '06b6d4',                               // old pink brand accent → cyan
    '1a1a2e': '0f172a', '0f0a1e': '0f172a', '0d0b1e': '0f172a', '0f0e17': '0f172a', '0f0e2a': '0f172a'
  };
  var SLATE = {
    '374151': '334155', '111827': '0f172a', '18181b': '0f172a', '1f2937': '1e293b',
    'f3f4f6': 'f1f5f9', 'e5e7eb': 'e2e8f0', 'fafafa': 'f8fafc', 'd1d5db': 'cbd5e1',
    'a1a1aa': '94a3b8', 'e4e4e7': 'e2e8f0', '71717a': '64748b', 'f4f4f5': 'f1f5f9',
    'd4d4d8': 'cbd5e1', 'e11d48': 'ef4444', 'fff1f2': 'fff1f1', '16a34a': '059669',
    '6b6b8a': '64748b', 'b0b0c0': '94a3b8', '6b6478': '64748b', 'b7b2c4': '94a3b8'
  };

  /* returns a new [r,g,b] for a color that should change, or null to leave it alone */
  function mapRGB(r, g, b) {
    var hx = toHex6(r, g, b), t = EXACT[hx];
    if (t) return fromHex6(t);
    if (CFG.slate && (t = SLATE[hx])) return fromHex6(t);
    var hsl = rgb2hsl(r, g, b), h = hsl[0], s = hsl[1], l = hsl[2];
    if (s < 0.04 || l < 0.02 || l > 0.995) return null;                     // true greys / white / black
    if (s >= 0.25 && h >= 246 && h <= 312) {                                  // purple · violet · fuchsia → indigo
      var nh = 243 + Math.max(-2, Math.min(2, (h - 282) * 0.05));
      return hsl2rgb(nh, Math.min(1, s * 0.92), l);
    }
    if (s < 0.25 && h >= 225 && h <= 320) return hsl2rgb(215, Math.min(s, 0.2), l); // lavender grey → slate
    return null;
  }

  /* ───────────────────────── color tokens in text ───────────────────────── */
  var TOKEN_RE = /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{4}|[0-9a-fA-F]{3})\b|rgba?\([^()]*\)|hsla?\([^()]*\)/g;
  var QUICK_RE = /#[0-9a-fA-F]{3}|rgba?\(|hsla?\(/;

  function num(v, pct) {
    v = String(v).trim();
    if (v.slice(-1) === '%') return parseFloat(v) * pct / 100;
    return parseFloat(v);
  }
  /* parse one color token → {r,g,b,a,kind,hasAlpha} or null (var(), calc(), "none" …) */
  function parse(tok) {
    var c = tok.charAt(0), m;
    if (c === '#') {
      var h = tok.slice(1), a = 1, hasA = false;
      if (h.length === 3 || h.length === 4) { h = h.replace(/./g, '$&$&'); }
      if (h.length === 8) { a = parseInt(h.slice(6, 8), 16) / 255; hasA = true; h = h.slice(0, 6); }
      var rgb = fromHex6(h.toLowerCase());
      return { r: rgb[0], g: rgb[1], b: rgb[2], a: a, hasAlpha: hasA, kind: 'hex' };
    }
    var inner = tok.slice(tok.indexOf('(') + 1, -1);
    if (/var\(|calc\(|none|from /.test(inner)) return null;
    var p = inner.split(/[\s,\/]+/).filter(Boolean);
    if (p.length < 3) return null;
    var alpha = p.length > 3 ? num(p[3], 1) : 1;
    if (isNaN(alpha)) return null;
    if (c === 'r') {
      var r = num(p[0], 255), g = num(p[1], 255), b = num(p[2], 255);
      if (isNaN(r + g + b)) return null;
      return { r: r, g: g, b: b, a: alpha, hasAlpha: p.length > 3, kind: 'rgb' };
    }
    var hh = parseFloat(p[0]), ss = parseFloat(p[1]) / 100, ll = parseFloat(p[2]) / 100;
    if (isNaN(hh + ss + ll)) return null;
    var cv = hsl2rgb(hh, ss, ll);
    return { r: cv[0], g: cv[1], b: cv[2], a: alpha, hasAlpha: p.length > 3, kind: 'hsl' };
  }
  function fmt(rgb, a, hasAlpha, kind) {
    if (kind === 'hex') {
      return '#' + toHex6(rgb[0], rgb[1], rgb[2]) + (hasAlpha && a < 1 ? hex2(a * 255) : '');
    }
    if (a < 1 || hasAlpha) return 'rgba(' + Math.round(rgb[0]) + ', ' + Math.round(rgb[1]) + ', ' + Math.round(rgb[2]) + ', ' + +a.toFixed(3) + ')';
    return 'rgb(' + Math.round(rgb[0]) + ', ' + Math.round(rgb[1]) + ', ' + Math.round(rgb[2]) + ')';
  }

  /* MindShift builds every translucent tint (chips, pills, tiles, glows, shadows, borders) from clean blue,
     rgba(37,99,235,α), and keeps indigo for solid buttons / text. Indigo at low alpha over white reads
     grey-lavender, so any indigo/purple at alpha ≤ .35 becomes that blue. */
  function mapFull(p) {
    var m = mapRGB(p.r, p.g, p.b), base = m || [p.r, p.g, p.b];
    if (CFG.tintBlue && p.a <= 0.35 && (p.hasAlpha || p.a < 1)) {
      var h = rgb2hsl(base[0], base[1], base[2]);
      if (h[0] >= 232 && h[0] <= 250 && h[1] >= 0.4 && h[2] >= 0.2 && h[2] <= 0.8) return h[2] > 0.65 ? [59, 130, 246] : [37, 99, 235];
    }
    return m;
  }
  var tokenCache = Object.create(null);
  function mapToken(tok) {
    var hit = tokenCache[tok];
    if (hit !== undefined) return hit;
    var out = tok, p = parse(tok);
    if (p) {
      var m = mapFull(p);
      if (m) out = fmt(m, p.a, p.hasAlpha, p.kind);
    }
    return (tokenCache[tok] = out);
  }
  function inUrl(str, idx) { return idx >= 4 && str.slice(idx - 4, idx) === 'url('; }
  function replaceColors(str) {
    return str.replace(TOKEN_RE, function (tok, off, whole) {
      return inUrl(whole, off) ? tok : mapToken(tok);
    });
  }

  /* ───────────────────────── gradients ─────────────────────────
     A brand gradient (indigo → something lighter / purple / pink) ends in cyan, MindShift style. */
  var CYAN = [6, 182, 212], CYAN_LIGHT = [34, 211, 238];
  function isBrandIndigo(rgb) {
    var h = rgb2hsl(rgb[0], rgb[1], rgb[2]);
    return h[0] >= 236 && h[0] <= 250 && h[1] >= 0.45 && h[2] >= 0.3 && h[2] <= 0.72;
  }
  function mapGradient(inner) {
    var toks = [], m, re = new RegExp(TOKEN_RE.source, 'g');
    while ((m = re.exec(inner))) {
      if (inUrl(inner, m.index)) continue;
      var p = parse(m[0]);
      toks.push({ s: m.index, e: m.index + m[0].length, tok: m[0], p: p });
    }
    if (!toks.length) return inner;
    toks.forEach(function (t) {
      t.out = t.tok;
      if (!t.p) return;
      var nm = mapFull(t.p);
      t.rgb = nm || [t.p.r, t.p.g, t.p.b];
      if (nm) t.out = fmt(nm, t.p.a, t.p.hasAlpha, t.p.kind);
    });
    if (CFG.gradientEnd) {
      var real = toks.filter(function (t) { return t.p; });
      if (real.length >= 2) {
        var f = real[0], l = real[real.length - 1];
        if (f.p.a >= 0.5 && l.p.a >= 0.5 && isBrandIndigo(f.rgb)) {
          var lh = rgb2hsl(l.p.r, l.p.g, l.p.b), fh = rgb2hsl(f.rgb[0], f.rgb[1], f.rgb[2]);
          var wasPurplePinkOrLightIndigo = lh[1] >= 0.45 && lh[2] >= 0.35 && lh[2] <= 0.8 && lh[0] >= 225 && lh[0] <= 345;
          if (wasPurplePinkOrLightIndigo && Math.abs(lh[2] - fh[2]) >= 0.04) {
            var c = lh[2] > 0.7 ? CYAN_LIGHT : CYAN;
            l.out = fmt(c, l.p.a, l.p.hasAlpha, l.p.kind);
          }
        }
      }
    }
    var out = '', pos = 0;
    toks.forEach(function (t) { out += inner.slice(pos, t.s) + t.out; pos = t.e; });
    return out + inner.slice(pos);
  }
  var GRAD_RE = /(?:repeating-)?(?:linear|radial|conic)-gradient\(/g;
  function transform(str) {
    if (!str || !QUICK_RE.test(str)) return str;
    var out = '', pos = 0, m;
    GRAD_RE.lastIndex = 0;
    while ((m = GRAD_RE.exec(str))) {
      var open = m.index + m[0].length, depth = 1, i = open;
      for (; i < str.length && depth; i++) {
        var ch = str.charAt(i);
        if (ch === '(') depth++; else if (ch === ')') depth--;
      }
      if (depth) break;                                    // unbalanced — give up on the rest
      out += replaceColors(str.slice(pos, open)) + mapGradient(str.slice(open, i - 1)) + ')';
      pos = i;
      GRAD_RE.lastIndex = i;
    }
    return out + replaceColors(str.slice(pos));
  }

  /* ───────────────────────── stylesheets ─────────────────────────
     <style> blocks are rewritten from their SOURCE text. The browser's style API hides the value of a
     shorthand that contains var() (e.g. background:linear-gradient(var(--p),#7c1fb0)), so reading the
     source is the only way to see every color. Only declaration bodies  { … }  are touched, never selectors. */
  function transformCssSource(src) {
    return src.replace(/\{([^{}]*)\}/g, function (m, body) {
      var out = QUICK_RE.test(body) ? transform(body) : body;
      /* a closed bottom sheet (translateY(100%)) with an upward shadow leaks that shadow into the page as a
         tinted band above the browser toolbar — push it far enough off-screen that the shadow can't reach */
      if (out.indexOf('translateY(100%)') > -1 && /box-shadow:\s*0\s+-\d+px/.test(out)) {
        out = out.replace(/translateY\(100%\)/g, 'translateY(calc(100% + 90px))');
      }
      return out === body ? m : '{' + out + '}';
    });
  }
  function processStyleEl(el) {
    if (!el || el.id === 'kv-theme-extras') return;
    var t = el.textContent;
    if (!t || !QUICK_RE.test(t)) return;
    var n = transformCssSource(t);
    if (n !== t) el.textContent = n;
  }
  /* linked / imported sheets can only be reached through the style API */
  function processRules(rules) {
    for (var i = 0; i < rules.length; i++) {
      var r = rules[i];
      try {
        if (r.style) {
          var c = r.style.cssText;
          if (c && QUICK_RE.test(c) && !/:\s*;/.test(c)) {   // an empty "prop: ;" means a var() shorthand the API can't show — never rewrite those
            var n = transform(c);
            if (n !== c) r.style.cssText = n;
          }
        }
        if (r.style && r.style.getPropertyValue) {          // linked CSS: same closed-sheet shadow fix as transformCssSource
          var tf = r.style.getPropertyValue('transform'), bs = r.style.getPropertyValue('box-shadow');
          if (tf && tf.indexOf('translateY(100%)') > -1 && bs && /^0(px)?\s+-\d+px/.test(bs.replace(/^rgba?\([^)]*\)\s*/, '').trim())) {
            r.style.setProperty('transform', tf.replace(/translateY\(100%\)/g, 'translateY(calc(100% + 90px))'), r.style.getPropertyPriority('transform'));
          }
        }
        if (r.cssRules && r.cssRules.length) processRules(r.cssRules);
        if (r.styleSheet) processSheet(r.styleSheet);     // @import
      } catch (e) { /* cross-origin or read-only rule — ignore */ }
    }
  }
  function processSheet(sheet) {
    if (!sheet) return;
    var rules;
    try { rules = sheet.cssRules; } catch (e) { return; }  // cross-origin (fonts etc.)
    if (rules) processRules(rules);
  }
  function processAllSheets() {
    var ss = document.styleSheets;
    for (var i = 0; i < ss.length; i++) processSheet(ss[i]);
  }

  /* ───────────────────────── elements ───────────────────────── */
  var ATTRS = ['fill', 'stroke', 'stop-color', 'flood-color', 'color'];
  var EL_SEL = '[style],[fill],[stroke],[stop-color],[flood-color]';
  function skipped(el) { return !!(el.closest && el.closest(CFG.skip)); }
  function processEl(el) {
    if (!el || el.nodeType !== 1) return;
    if (el.tagName === 'STYLE') { processStyleEl(el); return; }
    var s = el.getAttribute('style');
    var hasStyle = s && QUICK_RE.test(s);
    var hasAttr = false, a;
    for (a = 0; a < ATTRS.length; a++) if (el.hasAttribute(ATTRS[a])) { hasAttr = true; break; }
    if (!hasStyle && !hasAttr) return;
    if (skipped(el)) return;
    if (hasStyle) { var n = transform(s); if (n !== s) el.setAttribute('style', n); }
    if (hasAttr) for (a = 0; a < ATTRS.length; a++) {
      var v = el.getAttribute(ATTRS[a]);
      if (v && QUICK_RE.test(v)) { var nv = transform(v); if (nv !== v) el.setAttribute(ATTRS[a], nv); }
    }
  }
  function processTree(root) {
    if (!root || root.nodeType !== 1) return;
    processEl(root);
    var list = root.querySelectorAll ? root.querySelectorAll(EL_SEL + ',style') : [];
    for (var i = 0; i < list.length; i++) processEl(list[i]);
  }

  /* ───────────────────────── tokens + extras ───────────────────────── */
  var HARD_TOKENS = {
    '--p': '#4f46e5', '--p2': '#06b6d4', '--ps': '#4338ca',
    '--g': 'linear-gradient(90deg,#4f46e5,#06b6d4)',
    '--pink': '#06b6d4', '--pink2': '#06b6d4', '--p-neon': '#22d3ee'
  };
  function lightnessOf(css) {
    var m = css.match(TOKEN_RE); if (!m) return null;
    var p = parse(m[0]); if (!p) return null;
    return rgb2hsl(p.r, p.g, p.b)[2];
  }
  function applyTokens() {
    if (!CFG.tokens || !document.documentElement) return;
    var root = document.documentElement, cs = getComputedStyle(root), n;
    for (n in HARD_TOKENS) {
      if (cs.getPropertyValue(n).trim()) root.style.setProperty(n, HARD_TOKENS[n]);
    }
    var soft = [['--border', '#e2e8f0', function (l) { return l > 0.8; }],
                ['--border2', '#e2e8f0', function (l) { return l > 0.8; }],
                ['--bg', '#f8fafc', function (l, v) { return l > 0.9 && !/^#(?:fff|ffffff)$/i.test(v); }],
                ['--txt', '#0f172a', function (l) { return l < 0.22; }]];
    soft.forEach(function (t) {
      var v = cs.getPropertyValue(t[0]).trim();
      if (!v) return;
      var l = lightnessOf(v);
      if (l !== null && t[2](l, v)) root.style.setProperty(t[0], t[1]);
    });
  }
  function injectExtras() {
    var host = document.head || document.documentElement;
    if (!CFG.extras || !host || document.getElementById('kv-theme-extras')) return;   // not ready yet — boot() runs again on DOMContentLoaded
    var st = document.createElement('style');
    st.id = 'kv-theme-extras';
    st.textContent =
      ':root{--kv-p:#4f46e5;--kv-p2:#06b6d4;--kv-ps:#4338ca;--kv-g:linear-gradient(90deg,#4f46e5,#06b6d4);' +
      '--kv-bg:#f8fafc;--kv-border:#e2e8f0;--kv-ink:#0f172a;--kv-sub:#6b7280;--kv-mute:#9ca3af}' +
      'html{accent-color:#4f46e5}' +
      '::selection{background:#c7d2fe;color:#1e1b4b}' +
      'input,textarea{caret-color:#4f46e5}';
    host.appendChild(st);
  }

  /* ───────────────────────── observe forever ───────────────────────── */
  var pending = false, mo = null;
  var linkSeen = typeof WeakSet === 'function' ? new WeakSet() : null;
  function watchLink(link) {
    if (!link || link.tagName !== 'LINK' || !/stylesheet/i.test(link.rel || '')) return;
    if (linkSeen) { if (linkSeen.has(link)) return; linkSeen.add(link); }
    if (link.sheet) processSheet(link.sheet);
    link.addEventListener('load', function () { processSheet(link.sheet); applyTokens(); });
  }
  function schedule() {
    if (pending) return; pending = true;
    var run = function () { pending = false; processAllSheets(); if (mo) mo.takeRecords(); };
    (window.requestAnimationFrame || setTimeout)(run);
  }
  function onMutations(list) {
    var needSheets = false;
    for (var i = 0; i < list.length; i++) {
      var m = list[i];
      if (m.type === 'attributes') { processEl(m.target); continue; }
      if (m.type === 'characterData') {
        var par = m.target.parentNode;
        if (par && par.tagName === 'STYLE') processStyleEl(par);
        continue;
      }
      if (m.target && m.target.tagName === 'STYLE') { processStyleEl(m.target); continue; }
      for (var j = 0; j < m.addedNodes.length; j++) {
        var nd = m.addedNodes[j];
        if (nd.nodeType !== 1) continue;
        if (nd.tagName === 'LINK') { watchLink(nd); continue; }
        if (nd.tagName === 'STYLE') { processStyleEl(nd); needSheets = true; continue; }
        processTree(nd);
      }
    }
    if (needSheets) { processAllSheets(); schedule(); }
    mo.takeRecords();                                    // drop the mutations our own writes just caused
  }

  function boot() {
    injectExtras();
    var styles = document.querySelectorAll ? document.querySelectorAll('style') : [];
    for (var s0 = 0; s0 < styles.length; s0++) processStyleEl(styles[s0]);
    processAllSheets();
    var all = document.querySelectorAll ? document.querySelectorAll(EL_SEL) : [];
    for (var i = 0; i < all.length; i++) processEl(all[i]);
    var links = document.querySelectorAll ? document.querySelectorAll('link[rel~="stylesheet"]') : [];
    for (var k2 = 0; k2 < links.length; k2++) watchLink(links[k2]);
    applyTokens();
  }

  if (window.MutationObserver) {
    mo = new MutationObserver(onMutations);
    mo.observe(document, {
      childList: true, subtree: true, characterData: true,
      attributes: true, attributeFilter: ['style', 'fill', 'stroke', 'stop-color', 'flood-color']
    });
  }
  boot();                                                // whatever is already there (script runs first in <head>, so this is usually little)
  document.addEventListener('DOMContentLoaded', boot);
  window.addEventListener('load', function () { boot(); setTimeout(boot, 600); setTimeout(boot, 2500); }); // late CSS / lazy modules

  window.KievoraTheme = {
    version: '1.0',
    config: CFG,
    mapColor: function (s) { return transform(String(s)); },
    refresh: boot,
    disconnect: function () { if (mo) mo.disconnect(); }
  };
})();
