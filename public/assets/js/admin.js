(function () {
  document.querySelectorAll('[data-confirm]').forEach(function (b) { b.addEventListener('click', function (e) { if (!confirm(b.getAttribute('data-confirm'))) e.preventDefault(); }); });
  document.querySelectorAll('[data-fill]').forEach(function (a) { a.addEventListener('click', function (e) { e.preventDefault(); var f = document.querySelector('[name="' + a.getAttribute('data-fill') + '"]'); if (f) f.value = a.getAttribute('data-value'); }); });
  document.querySelectorAll('[data-copy-html]').forEach(function (b) {
    b.addEventListener('click', function () {
      var el = document.getElementById(b.getAttribute('data-copy-html'));
      var htmlStr = el.innerHTML, text = el.innerText;
      var done = function () { b.textContent = 'Copied'; setTimeout(function () { b.textContent = 'Copy for Beehiiv'; }, 1800); };
      if (navigator.clipboard && window.ClipboardItem) {
        navigator.clipboard.write([new ClipboardItem({ 'text/html': new Blob([htmlStr], { type: 'text/html' }), 'text/plain': new Blob([text], { type: 'text/plain' }) })]).then(done).catch(function () { fallback(el, done); });
      } else fallback(el, done);
    });
  });
  function fallback(el, done) { var r = document.createRange(); r.selectNodeContents(el); var s = window.getSelection(); s.removeAllRanges(); s.addRange(r); document.execCommand('copy'); s.removeAllRanges(); done(); }
  document.querySelectorAll('[data-copy-text]').forEach(function (b) {
    b.addEventListener('click', function () { var ta = document.getElementById(b.getAttribute('data-copy-text')); var label = b.getAttribute('data-copy-label') || 'Copy raw HTML'; navigator.clipboard.writeText(ta.value).then(function () { b.textContent = 'Copied'; setTimeout(function () { b.textContent = label; }, 1800); }); });
  });
})();
