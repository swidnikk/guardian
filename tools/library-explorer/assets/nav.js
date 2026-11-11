// Catalog dropdown (B-05). Disclosure pattern: a button toggles a list of links. Inlined into every page by render.js.
// Without JavaScript the list is plain visible links (the markup has no hidden attribute).
(function () {
  // B-12: the header, nav and intro are pinned (.shell-sticky). Publish its real height as --sticky-top so the filter panel and anchor scrolling sit just below it.
  var pin = document.getElementById('shell-sticky'), root = document.documentElement;
  function measure() { if (pin) root.style.setProperty('--sticky-top', Math.ceil(pin.getBoundingClientRect().height) + 12 + 'px'); }
  if (pin) {
    measure(); window.addEventListener('resize', measure); window.addEventListener('load', measure);
    if (window.ResizeObserver) new ResizeObserver(measure).observe(pin);
    var more = document.getElementById('shell-intro-more'), intro = pin.querySelector('.shell-intro');
    if (more && intro) more.addEventListener('click', function () { var o = intro.classList.toggle('is-open'); more.setAttribute('aria-expanded', o ? 'true' : 'false'); more.textContent = o ? 'Less' : 'More'; measure(); });
  }
  var btn = document.getElementById('nav-catalog-btn'), menu = document.getElementById('nav-catalog-menu');
  if (!btn || !menu) return;
  var host = btn.closest('.nav-dd') || btn.parentNode;
  var links = function () { return Array.prototype.slice.call(menu.querySelectorAll('a')); };
  document.documentElement.classList.add('js');
  var isOpen = function () { return !menu.hidden; };
  function open(focusFirst) {
    menu.hidden = false; btn.setAttribute('aria-expanded', 'true'); host.classList.add('is-open');
    if (focusFirst) { var l = links(); if (l.length) l[0].focus(); }
  }
  function close(returnFocus) {
    menu.hidden = true; btn.setAttribute('aria-expanded', 'false'); host.classList.remove('is-open');
    if (returnFocus) btn.focus();
  }
  menu.hidden = true; btn.setAttribute('aria-expanded', 'false');
  btn.addEventListener('click', function () { if (isOpen()) close(false); else open(false); });
  btn.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowDown') { e.preventDefault(); open(true); }
    else if (e.key === 'Escape' && isOpen()) { e.preventDefault(); close(true); }
  });
  menu.addEventListener('keydown', function (e) {
    var l = links(), i = l.indexOf(document.activeElement);
    if (e.key === 'Escape') { e.preventDefault(); close(true); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); l[(i + 1) % l.length].focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); l[(i - 1 + l.length) % l.length].focus(); }
    else if (e.key === 'Home') { e.preventDefault(); l[0].focus(); }
    else if (e.key === 'End') { e.preventDefault(); l[l.length - 1].focus(); }
  });
  // Tab out of the menu closes it (no focus trap); clicking elsewhere closes it.
  host.addEventListener('focusout', function (e) { if (isOpen() && e.relatedTarget && !host.contains(e.relatedTarget)) close(false); });
  document.addEventListener('click', function (e) { if (isOpen() && !host.contains(e.target)) close(false); });
})();
