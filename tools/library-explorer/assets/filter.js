// Catalog filtering: pure DOM, no fetch, no WASM; works from file://. State lives in the URL query string.
document.addEventListener('DOMContentLoaded', function () { // deferred md.js has defined+upgraded <md-checkbox> by now
  var grid = document.getElementById('grid'), cards = [].slice.call(grid.children);
  var boxes = [].slice.call(document.querySelectorAll('md-checkbox[data-facet]'));
  var qf = document.getElementById('f-q');
  var KEYS = ['status', 'policy_type', 'standard_body', 'category', 'sector', 'net', 'sdg', 'tag'];
  var LABEL = { status: 'Status', policy_type: 'Type', standard_body: 'Standard body', category: 'Category', sector: 'Sector', net: 'Hedera', sdg: 'SDG', tag: 'Tag', q: 'Search' };
  var state = {}; // key -> array of values
  function readUrl() {
    var p = new URLSearchParams(location.search); state = {};
    KEYS.forEach(function (k) { var v = p.getAll(k).filter(Boolean); if (v.length) state[k] = v; });
    qf.value = p.get('q') || '';
  }
  function writeUrl(push) {
    var p = new URLSearchParams();
    KEYS.forEach(function (k) { (state[k] || []).forEach(function (v) { p.append(k, v); }); });
    if (qf.value) p.set('q', qf.value);
    var url = location.pathname + (p.toString() ? '?' + p : '');
    if (url !== location.pathname + location.search) history[push ? 'pushState' : 'replaceState'](null, '', url);
  }
  function has(card, k, v) {
    if (k === 'sdg') return (card.dataset.sdg || '').indexOf(' ' + v + ' ') > -1;
    if (k === 'tag') return (card.dataset.tag || '').indexOf(' ' + v + ' ') > -1;
    return card.dataset[k] === v;
  }
  function match(card, skip) {
    var terms = qf.value.toLowerCase().split(/\s+/).filter(Boolean);
    for (var i = 0; i < terms.length; i++) if ((card.dataset.text || '').indexOf(terms[i]) < 0) return false;
    for (var k in state) {
      if (k === skip) continue;
      if (!state[k].some(function (v) { return has(card, k, v); })) return false;
    }
    return true;
  }
  function apply() {
    var n = 0;
    cards.forEach(function (c) { var ok = match(c); c.hidden = !ok; if (ok) n++; });
    document.getElementById('count').textContent = n + ' of ' + cards.length + ' policies';
    document.getElementById('empty').hidden = n > 0;
    document.getElementById('empty-hint').textContent = (state.net || []).indexOf('mainnet') > -1 ? 'No policy has a recorded mainnet publication yet. A missing publications.json means nothing is recorded, not that nothing exists.' : '';
    boxes.forEach(function (b) { b.checked = (state[b.dataset.facet] || []).indexOf(b.value) > -1; });
    // faceted counts: for each option, how many cards match all OTHER facets plus this value
    [].slice.call(document.querySelectorAll('[data-count-for]')).forEach(function (el) {
      var kv = el.getAttribute('data-count-for').split('='), k = kv[0], v = kv.slice(1).join('='), c = 0;
      cards.forEach(function (card) { if (match(card, k) && has(card, k, v)) c++; });
      el.textContent = c; el.parentNode.classList.toggle('zero', c === 0);
    });
    // active filter chips
    var act = document.getElementById('active'); act.textContent = '';
    function add(k, v) {
      var b = document.createElement('button'); b.type = 'button'; b.className = 'chip active'; b.setAttribute('aria-label', 'Remove filter ' + LABEL[k] + ': ' + v);
      b.textContent = LABEL[k] + ': ' + v + ' ✕';
      b.onclick = function () { if (k === 'q') qf.value = ''; else state[k] = state[k].filter(function (x) { return x !== v; }); if (k !== 'q' && !state[k].length) delete state[k]; changed(); };
      act.appendChild(b);
    }
    for (var k in state) state[k].forEach(function (v) { add(k, v); });
    if (qf.value) add('q', qf.value);
  }
  function changed(push) { writeUrl(push !== false); apply(); }
  boxes.forEach(function (b) {
    b.addEventListener('change', function () {
      var k = b.dataset.facet, cur = state[k] || [];
      state[k] = b.checked ? cur.concat(b.value) : cur.filter(function (x) { return x !== b.value; });
      if (!state[k].length) delete state[k];
      changed();
    });
  });
  qf.addEventListener('input', function () { changed(false); });
  // clickable chips on cards: set that facet to exactly that value
  grid.addEventListener('click', function (e) {
    var a = e.target.closest ? e.target.closest('a[data-filter]') : null; if (!a || e.ctrlKey || e.metaKey) return;
    e.preventDefault(); state[a.dataset.filter] = [a.dataset.value]; changed();
    var f = document.getElementById('filters'); if (f && f.scrollIntoView && window.innerWidth < 800) f.scrollIntoView();
  });
  document.getElementById('clear-all').addEventListener('click', function () { state = {}; qf.value = ''; changed(); });
  document.getElementById('empty-clear').addEventListener('click', function (e) { e.preventDefault(); state = {}; qf.value = ''; changed(); });
  [].slice.call(document.querySelectorAll('button[data-more]')).forEach(function (b) {
    b.addEventListener('click', function () {
      var fs = b.closest('fieldset'), open = fs.classList.toggle('expanded');
      b.setAttribute('aria-expanded', open); b.textContent = open ? 'Show fewer' : 'Show all ' + b.dataset.total;
    });
  });
  window.addEventListener('popstate', function () { readUrl(); apply(); });
  readUrl();
  // expand groups that contain a selected extra option
  KEYS.forEach(function (k) { (state[k] || []).forEach(function (v) { var el = document.querySelector('md-checkbox[data-facet="' + k + '"][value="' + v.replace(/"/g, '') + '"]'); if (el && el.closest('.extra')) el.closest('fieldset').classList.add('expanded'); }); });
  apply();
  document.documentElement.setAttribute('data-ready', '1');
});
