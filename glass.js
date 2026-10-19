/* KOOM glass layer — presentation only: replays the page-entrance animation on route change. */
(function () {
  var v = document.getElementById('view'); if (!v) return; var t;
  function go() { v.classList.remove('g-enter'); void v.offsetWidth; v.classList.add('g-enter'); clearTimeout(t); t = setTimeout(function () { v.classList.remove('g-enter'); }, 900); }
  addEventListener('hashchange', go); go();
})();
