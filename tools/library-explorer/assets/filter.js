// Catalog filtering: pure DOM, no fetch, no WASM, no dependency; works from file://. State lives in the URL query string.
// Facets are disclosure multiselects (toggle button + panel of native checkboxes, chips with remove buttons). Switches hide deprecated/superseded by default (B-10).
document.addEventListener('DOMContentLoaded', function () {
  var grid = document.getElementById('grid'), cards = [].slice.call(grid.children);
  var qf = document.getElementById('f-q');
  var KEYS = ['status', 'policy_type', 'standard_body', 'category', 'sector', 'net', 'sdg', 'tag'];
  var SWITCHES = ['deprecated', 'superseded']; // status values hidden unless their switch is Included
  var state = {}; // facet key -> array of values
  var inc = { deprecated: false, superseded: false };
  var facets = {}; // key -> { root, toggle, panel, chips, value, checks }
  [].slice.call(document.querySelectorAll('.facet[data-facet]')).forEach(function (root) {
    var k = root.getAttribute('data-facet');
    facets[k] = { root: root, toggle: root.querySelector('.facet-toggle'), panel: root.querySelector('.facet-panel'), chips: root.querySelector('.facet-chips'),
      checks: [].slice.call(root.querySelectorAll('input[type=checkbox][data-facet]')), label: (root.querySelector('.facet-label') || {}).textContent || k };
  });
  var switches = {};
  SWITCHES.forEach(function (s) { switches[s] = document.getElementById('sw-' + s); });
  var SW_LABEL = { deprecated: 'Deprecated Policies', superseded: 'Superseded Policies' };

  function readUrl() {
    var p = new URLSearchParams(location.search); state = {};
    KEYS.forEach(function (k) { var v = p.getAll(k).filter(Boolean); if (v.length) state[k] = v; });
    SWITCHES.forEach(function (s) { inc[s] = p.get('include_' + s) === '1'; });
    qf.value = p.get('q') || '';
    normalize();
  }
  // Q-16 (ASSUMED): a link that names a hidden status turns that switch to Included so the link shows what it says.
  function normalize() { SWITCHES.forEach(function (s) { if ((state.status || []).indexOf(s) > -1) inc[s] = true; }); }
  function writeUrl(push) {
    var p = new URLSearchParams();
    KEYS.forEach(function (k) { (state[k] || []).forEach(function (v) { p.append(k, v); }); });
    SWITCHES.forEach(function (s) { if (inc[s]) p.set('include_' + s, '1'); });
    if (qf.value) p.set('q', qf.value);
    var url = location.pathname + (p.toString() ? '?' + p : '');
    if (url !== location.pathname + location.search) history[push ? 'pushState' : 'replaceState'](null, '', url);
  }
  function has(card, k, v) {
    if (k === 'sdg' || k === 'tag') return (card.dataset[k] || '').indexOf(' ' + v + ' ') > -1;
    return card.dataset[k] === v;
  }
  function visibleByStatus(card) { var s = card.dataset.status; return !(SWITCHES.indexOf(s) > -1 && !inc[s]); }
  function match(card, skip) {
    if (!visibleByStatus(card)) return false;
    var terms = qf.value.toLowerCase().split(/\s+/).filter(Boolean);
    for (var i = 0; i < terms.length; i++) if ((card.dataset.text || '').indexOf(terms[i]) < 0) return false;
    for (var k in state) {
      if (k === skip) continue;
      if (!state[k].some(function (v) { return has(card, k, v); })) return false;
    }
    return true;
  }
  function optLabel(k, v) {
    var f = facets[k], el = f && f.checks.filter(function (c) { return c.value === v; })[0];
    var l = el && el.parentNode.querySelector('.facet-opt-label');
    return l ? l.textContent : v;
  }
  var swCount = {}; SWITCHES.forEach(function (s) { swCount[s] = cards.filter(function (c) { return c.dataset.status === s; }).length; });
  function apply() {
    // the total only counts policies the switches allow (excluded deprecated/superseded are out of scope, not "hidden")
    var n = 0, avail = 0;
    cards.forEach(function (c) { var ok = match(c); c.hidden = !ok; if (ok) n++; if (visibleByStatus(c)) avail++; });
    document.getElementById('count').textContent = n + ' of ' + avail + ' policies';
    document.getElementById('empty').hidden = n > 0;
    document.getElementById('empty-hint').textContent = (state.net || []).indexOf('mainnet') > -1 ? 'No policy has a recorded mainnet publication yet. A missing publications.json means nothing is recorded, not that nothing exists.' : '';
    SWITCHES.forEach(function (s) {
      var el = switches[s]; if (!el) return;
      el.checked = inc[s];
      var t = document.getElementById('sw-' + s + '-lbl');
      if (t) t.textContent = SW_LABEL[s] + (inc[s] ? ' Included' : ' Excluded') + ' (' + swCount[s] + ')'; // the count sits on the switch so people can find the excluded ones there
    });
    // faceted counts: for each option, how many visible cards match all OTHER facets plus this value
    [].slice.call(document.querySelectorAll('[data-count-for]')).forEach(function (el) {
      var kv = el.getAttribute('data-count-for').split('='), k = kv[0], v = kv.slice(1).join('='), c = 0;
      cards.forEach(function (card) { if (match(card, k) && has(card, k, v)) c++; });
      el.textContent = c;
      var opt = el.closest('.facet-opt'); if (opt) { opt.classList.toggle('zero', c === 0); if (k === 'status' && SWITCHES.indexOf(v) > -1) opt.hidden = !inc[v]; }
    });
    KEYS.forEach(function (k) {
      var f = facets[k]; if (!f) return; var sel = state[k] || [];
      f.checks.forEach(function (c) { c.checked = sel.indexOf(c.value) > -1; });
      var hadFocus = f.chips.contains(document.activeElement);
      f.chips.textContent = '';
      sel.forEach(function (v) {
        var li = document.createElement('li'); li.className = 'facet-chip';
        var sp = document.createElement('span'); sp.textContent = optLabel(k, v);
        var b = document.createElement('button'); b.type = 'button'; b.className = 'facet-chip-x'; b.setAttribute('data-remove', v);
        b.setAttribute('aria-label', 'Remove ' + f.label + ': ' + optLabel(k, v)); b.textContent = '✕';
        b.addEventListener('click', function () { state[k] = (state[k] || []).filter(function (x) { return x !== v; }); if (!state[k].length) delete state[k]; changed(); f.toggle.focus(); });
        li.appendChild(sp); li.appendChild(b); f.chips.appendChild(li);
      });
      f.toggle.textContent = sel.length ? 'Add more' : 'Any';
      f.toggle.removeAttribute('aria-labelledby'); f.toggle.setAttribute('aria-label', f.label + ': ' + (sel.length ? sel.length + ' selected, add more' : 'any'));
      if (hadFocus && !f.chips.contains(document.activeElement)) f.toggle.focus();
    });
    var act = document.getElementById('active'); if (act && !act.hidden) act.textContent = '';
  }
  // collapsed-panel notice (narrow screens): "# Filters Applied | Reset Filters"; counts facet values plus a non-empty search, not the two status switches
  function updateApplied() {
    var n = qf.value.trim() ? 1 : 0; for (var k in state) n += state[k].length;
    var box = document.getElementById('filters-applied'), t = document.getElementById('applied-n');
    if (box && t) { box.hidden = !n; t.textContent = n + (n === 1 ? ' Filter Applied' : ' Filters Applied'); }
  }
  function changed(push) { writeUrl(push !== false); apply(); updateApplied(); announce(); }

  // ---- facet dropdown behaviour (disclosure pattern) ----
  function openFacet(k, focusFirst) {
    closeAll(k); var f = facets[k]; f.panel.hidden = false; f.toggle.setAttribute('aria-expanded', 'true');
    if (focusFirst) { var first = visibleChecks(f)[0]; if (first) first.focus(); }
  }
  function closeFacet(k, refocus) { var f = facets[k]; if (f.panel.hidden) return; f.panel.hidden = true; f.toggle.setAttribute('aria-expanded', 'false'); if (refocus) f.toggle.focus(); }
  function closeAll(except) { for (var k in facets) if (k !== except) closeFacet(k, false); }
  function visibleChecks(f) { return f.checks.filter(function (c) { return !c.closest('.facet-opt').hidden; }); }
  KEYS.forEach(function (k) {
    var f = facets[k]; if (!f) return;
    f.toggle.addEventListener('click', function () { f.panel.hidden ? openFacet(k, false) : closeFacet(k, false); });
    f.toggle.addEventListener('keydown', function (e) { if (e.key === 'ArrowDown') { e.preventDefault(); openFacet(k, true); } });
    f.root.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !f.panel.hidden) { e.preventDefault(); e.stopPropagation(); closeFacet(k, true); return; }
      if (e.target.classList && e.target.matches('input[type=checkbox]') && /^(ArrowDown|ArrowUp|Home|End)$/.test(e.key)) {
        e.preventDefault(); var list = visibleChecks(f), i = list.indexOf(e.target);
        i = e.key === 'Home' ? 0 : e.key === 'End' ? list.length - 1 : Math.max(0, Math.min(list.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)));
        if (list[i]) list[i].focus();
      }
    });
    // leaving the facet by Tab closes its panel
    f.root.addEventListener('focusout', function (e) { if (e.relatedTarget && !f.root.contains(e.relatedTarget)) closeFacet(k, false); });
    f.checks.forEach(function (c) {
      c.addEventListener('change', function () {
        var cur = state[k] || [];
        state[k] = c.checked ? cur.concat(c.value) : cur.filter(function (x) { return x !== c.value; });
        if (!state[k].length) delete state[k];
        normalize(); changed();
      });
    });
  });
  document.addEventListener('click', function (e) { for (var k in facets) if (!facets[k].root.contains(e.target)) closeFacet(k, false); });

  // ---- switches ----
  SWITCHES.forEach(function (s) {
    var el = switches[s]; if (!el) return;
    el.addEventListener('change', function () {
      inc[s] = el.checked;
      if (!inc[s] && state.status) { state.status = state.status.filter(function (x) { return x !== s; }); if (!state.status.length) delete state.status; }
      changed();
    });
  });

  qf.addEventListener('input', function () { changed(false); });
  // B-11: value links on cards (sector, category, standards body, publication, status, policy type, tags) ADD that value to the current filters in place.
  // Without JavaScript they are plain links to index.html?key=value, which readUrl() above applies on load. Modified clicks (new tab etc.) keep the browser default.
  grid.addEventListener('click', function (e) {
    var a = e.target.closest ? e.target.closest('a[data-filter]') : null; if (!a || e.defaultPrevented || e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
    var k = a.dataset.filter, v = a.dataset.value; if (KEYS.indexOf(k) < 0) return;
    e.preventDefault();
    var cur = state[k] || [], had = cur.indexOf(v) > -1;
    if (!had) state[k] = cur.concat(v);
    normalize(); changed();
    var lbl = (facets[k] ? facets[k].label : k) + ': ' + optLabel(k, v);
    announce((had ? 'Already filtering by ' : 'Added filter ') + lbl + '. ', true);
  });
  // one polite live region for result changes; link clicks prefix their message
  var announceEl = document.getElementById('announce'), announceTimer, announcePrefix = '';
  function announce(prefix, now) {
    if (prefix != null) announcePrefix = prefix;
    clearTimeout(announceTimer);
    announceTimer = setTimeout(function () { if (announceEl) announceEl.textContent = announcePrefix + document.getElementById('count').textContent; announcePrefix = ''; }, now ? 50 : 400);
  }
  function reset(e) { if (e) e.preventDefault(); state = {}; inc = { deprecated: false, superseded: false }; qf.value = ''; closeAll(); changed(); }
  document.getElementById('clear-all').addEventListener('click', reset);
  var ar = document.getElementById('applied-reset'); if (ar) ar.addEventListener('click', function (e) { e.stopPropagation(); reset(e); });
  document.getElementById('empty-clear').addEventListener('click', reset);
  // Q-4: below 861px the filters sit in a collapsed <details>; above it is always open
  var det = document.getElementById('filters-details');
  function syncDetails() { if (det && window.innerWidth >= 861) det.open = true; }
  window.addEventListener('resize', syncDetails); syncDetails();
  window.addEventListener('popstate', function () { readUrl(); apply(); updateApplied(); });
  readUrl();
  apply(); updateApplied();
  document.documentElement.setAttribute('data-ready', '1');
});
