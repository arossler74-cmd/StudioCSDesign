// Floating section index for long project tabs (Concept, Design & sourcing).
// A round button at the bottom right names the section you are in and rings
// how far down the page you are; tapping it lists every section so you can
// jump straight there. It knows nothing about the app's state: it reads the
// page itself. Any element marked
//   data-nav="Label"          becomes an entry,
//   data-nav-sub              makes it an indented child of the entry it sits in,
//   data-nav-amt="$12,400"    shows an amount beside it,
//   data-nav-state="hidden"   marks it (and everything inside it) as hidden
//                             from the export, with the eye-off icon.
// With fewer than three visible entries, or while a dialog is open, the
// button stays out of the way.
(function () {
  if (window.__sectionNav) return;
  window.__sectionNav = true;

  var EYE_OFF = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a18.5 18.5 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><path d="M14.12 14.12a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';

  var css = '' +
    '.cs-snav { position: fixed; right: 18px; bottom: calc(18px + env(safe-area-inset-bottom, 0px)); z-index: 35; font-family: var(--font-body, Jost, sans-serif); }' +
    '.cs-snav[hidden] { display: none !important; }' +
    '.cs-snav-btn { display: flex; align-items: center; gap: 10px; border: 1px solid var(--color-neutral-200); background: var(--color-surface); color: var(--color-text); border-radius: 999px; padding: 7px 14px 7px 7px; font: inherit; font-size: 13px; cursor: pointer; box-shadow: var(--shadow-lg); max-width: min(320px, 72vw); transition: transform .16s var(--ease-spring, ease); }' +
    '.cs-snav-btn:hover { transform: translateY(-1px); }' +
    '.cs-snav-btn:focus-visible, .cs-snav-panel a:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 2px; }' +
    '.cs-snav-ring { width: 28px; height: 28px; flex: none; }' +
    '.cs-snav-ring circle { fill: none; stroke-width: 3; }' +
    '.cs-snav-ring .bg { stroke: var(--color-neutral-200); }' +
    '.cs-snav-ring .fg { stroke: var(--color-accent); stroke-linecap: round; }' +
    '.cs-snav-cur { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: inline-flex; align-items: center; gap: 6px; min-width: 0; }' +
    '.cs-snav-caret { color: var(--color-neutral-500); flex: none; }' +
    '.cs-snav-panel { position: absolute; right: 0; bottom: calc(100% + 10px); width: min(310px, 86vw); max-height: min(70vh, 560px); overflow: auto; background: var(--color-surface); border: 1px solid var(--color-neutral-200); border-radius: 12px; box-shadow: var(--shadow-lg); padding: 8px; transform-origin: bottom right; transition: opacity .16s, transform .22s var(--ease-spring, ease); }' +
    '.cs-snav-panel[data-open="false"] { opacity: 0; transform: scale(.96) translateY(6px); pointer-events: none; visibility: hidden; }' +
    '.cs-snav-panel a { display: flex; align-items: center; gap: 8px; padding: 6px 10px; border-radius: 6px; text-decoration: none; color: var(--color-text); font-size: 13px; cursor: pointer; }' +
    '.cs-snav-panel a.sub { padding-left: 24px; color: var(--color-neutral-600); }' +
    '.cs-snav-panel a .lbl { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }' +
    '.cs-snav-panel a .amt { color: var(--color-neutral-500); font-size: 12px; font-variant-numeric: tabular-nums; }' +
    '.cs-snav-panel a .eye { color: var(--color-neutral-500); display: inline-flex; flex: none; }' +
    '.cs-snav-panel a.is-hidden .lbl { color: var(--color-neutral-500); }' +
    '.cs-snav-panel a:hover { background: var(--color-neutral-100); }' +
    '.cs-snav-panel a.on { background: var(--color-accent-100); color: var(--color-accent-800); }' +
    '.cs-snav-panel a.top { border-top: 1px solid var(--color-neutral-200); margin-top: 6px; padding-top: 9px; color: var(--color-neutral-600); border-radius: 0 0 6px 6px; }' +
    '.cs-snav-cur .eye { color: var(--color-neutral-500); display: inline-flex; }' +
    '@media (prefers-reduced-motion: reduce) { .cs-snav-btn, .cs-snav-panel { transition: none; } }';

  function mount() {
    var style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);

    var R = 11, C = 2 * Math.PI * R;
    var root = document.createElement('div');
    root.className = 'cs-snav';
    root.hidden = true;
    root.innerHTML =
      '<div class="cs-snav-panel" data-open="false" role="menu" aria-label="Sections on this page"></div>' +
      '<button type="button" class="cs-snav-btn" aria-expanded="false" aria-haspopup="menu" title="Jump to a section">' +
      '<svg class="cs-snav-ring" viewBox="0 0 28 28" aria-hidden="true"><circle class="bg" cx="14" cy="14" r="' + R + '"/><circle class="fg" cx="14" cy="14" r="' + R + '" transform="rotate(-90 14 14)" stroke-dasharray="' + C + '" stroke-dashoffset="' + C + '"/></svg>' +
      '<span class="cs-snav-cur"></span><span class="cs-snav-caret">▴</span></button>';
    document.body.appendChild(root);

    var panel = root.querySelector('.cs-snav-panel');
    var btn = root.querySelector('.cs-snav-btn');
    var cur = root.querySelector('.cs-snav-cur');
    var ring = root.querySelector('.fg');
    var items = [], current = -1, lastKey = '';

    var chromeH = function () {
      var c = document.querySelector('.cs-chrome');
      return c ? c.getBoundingClientRect().height : 0;
    };
    var esc = function (s) { return String(s).replace(/[&<>"]/g, function (ch) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]; }); };

    function collect() {
      var out = [];
      document.querySelectorAll('[data-nav]').forEach(function (el) {
        if (!el.getClientRects().length) return; // not on screen (other tab)
        var label = (el.getAttribute('data-nav') || '').trim();
        if (!label || label.indexOf('{{') !== -1) return;
        var sub = el.hasAttribute('data-nav-sub');
        var parent = sub && el.parentElement ? el.parentElement.closest('[data-nav]') : null;
        out.push({
          el: el, label: label, sub: sub,
          parent: parent ? (parent.getAttribute('data-nav') || '').trim() : '',
          amt: (el.getAttribute('data-nav-amt') || '').trim().replace(/^\$0$/, ''), // nothing priced yet
          hidden: !!el.closest('[data-nav-state="hidden"]'),
        });
      });
      return out;
    }

    function renderPanel() {
      panel.innerHTML = items.map(function (it, i) {
        return '<a role="menuitem" tabindex="0" data-i="' + i + '" class="' + (it.sub ? 'sub' : '') + (it.hidden ? ' is-hidden' : '') + (i === current ? ' on' : '') + '"' +
          (it.hidden ? ' title="Hidden from the export"' : '') + '>' +
          '<span class="lbl">' + esc(it.label) + '</span>' +
          (it.amt ? '<span class="amt">' + esc(it.amt) + '</span>' : '') +
          (it.hidden ? '<span class="eye" aria-label="Hidden from the export">' + EYE_OFF + '</span>' : '') +
          '</a>';
      }).join('') + '<a role="menuitem" tabindex="0" class="top" data-top="1"><span class="lbl">Back to top</span><span>↑</span></a>';
    }

    function update() {
      var dialogOpen = !!document.querySelector('.dialog-backdrop');
      items = collect();
      if (items.length < 3 || dialogOpen) {
        root.hidden = true;
        if (dialogOpen) close();
        return;
      }
      root.hidden = false;
      // the last entry whose top has passed a line just under the sticky bar
      var line = chromeH() + 48, idx = 0;
      items.forEach(function (it, i) { if (it.el.getBoundingClientRect().top - line <= 0) idx = i; });
      // at the very bottom the last sections can never reach that line, so
      // the lowest one in view wins
      var max = document.documentElement.scrollHeight - innerHeight;
      if (max > 0 && scrollY >= max - 4) items.forEach(function (it, i) { if (i > idx && it.el.getBoundingClientRect().top < innerHeight) idx = i; });
      var it = items[idx];
      var key = items.map(function (x) { return x.label + '|' + x.amt + '|' + x.hidden; }).join(';') + '#' + idx;
      if (key !== lastKey) {
        lastKey = key; current = idx;
        cur.innerHTML = esc(it.sub && it.parent ? it.parent + ' · ' + it.label : it.label) +
          (it.hidden ? '<span class="eye" title="Hidden from the export">' + EYE_OFF + '</span>' : '');
        if (panel.dataset.open === 'true') renderPanel();
      }
      var p = max > 0 ? Math.min(1, Math.max(0, scrollY / max)) : 0;
      ring.setAttribute('stroke-dashoffset', String(C * (1 - p)));
    }

    function open() {
      renderPanel();
      panel.dataset.open = 'true';
      btn.setAttribute('aria-expanded', 'true');
      var on = panel.querySelector('a.on');
      if (on) on.scrollIntoView({ block: 'nearest' });
    }
    function close() {
      panel.dataset.open = 'false';
      btn.setAttribute('aria-expanded', 'false');
    }
    function go(a) {
      if (a.dataset.top) window.scrollTo({ top: 0, behavior: 'smooth' });
      else {
        var it = items[Number(a.dataset.i)];
        if (it) window.scrollTo({ top: it.el.getBoundingClientRect().top + scrollY - chromeH() - 14, behavior: 'smooth' });
      }
      close();
      btn.focus({ preventScroll: true });
    }

    btn.addEventListener('click', function () { panel.dataset.open === 'true' ? close() : open(); });
    panel.addEventListener('click', function (e) { var a = e.target.closest('a'); if (a) go(a); });
    panel.addEventListener('keydown', function (e) {
      var a = e.target.closest('a');
      if (a && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); go(a); }
    });
    document.addEventListener('click', function (e) { if (!root.contains(e.target)) close(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && panel.dataset.open === 'true') { close(); btn.focus(); } });

    var raf = 0;
    var schedule = function () { if (!raf) raf = requestAnimationFrame(function () { raf = 0; update(); }); };
    addEventListener('scroll', schedule, { passive: true });
    addEventListener('resize', schedule);
    // tabs switch, rooms get added or renamed, sections hidden: the page
    // re-renders, so re-read it after each change
    new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-nav', 'data-nav-state', 'data-nav-amt'] });
    schedule();
  }

  if (document.body) mount();
  else document.addEventListener('DOMContentLoaded', mount);
})();
