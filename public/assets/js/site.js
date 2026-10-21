// Progressive enhancement: forms post with fetch and show inline messages;
// without JS every form still submits normally and gets a JSON reply.
(function () {
  var toggle = document.querySelector('.nav-toggle');
  var mobile = document.getElementById('mobile-nav');
  if (toggle && mobile) {
    toggle.addEventListener('click', function () {
      var open = toggle.getAttribute('aria-expanded') === 'true';
      toggle.setAttribute('aria-expanded', String(!open));
      mobile.hidden = open;
    });
  }

  function wire(form) {
    var msg = form.querySelector('.signup-msg, .form-msg');
    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var btn = form.querySelector('button[type="submit"]');
      var fd = new FormData(form);
      var body = new URLSearchParams();
      fd.forEach(function (v, k) { body.append(k, v); });
      if (btn) { btn.disabled = true; }
      if (msg) { msg.textContent = ''; msg.className = msg.className.replace(/\b(ok|err)\b/g, ''); }
      fetch(form.action, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Accept': 'application/json' }, body: body.toString() })
        .then(function (r) { return r.json().catch(function () { return { success: false, error: 'Unexpected reply. Try again.' }; }); })
        .then(function (j) {
          if (btn) btn.disabled = false;
          if (j.success) {
            if (form.hasAttribute('data-signup')) { try { localStorage.setItem('watch-sub', '1'); } catch (e) {} }
            if (form.hasAttribute('data-signup') && j.next) { window.location.href = j.next; return; }
            if (msg) { msg.textContent = j.message || 'Done.'; msg.classList.add('ok'); }
            if (!form.hasAttribute('data-keep')) form.reset();
          } else if (msg) { msg.textContent = j.error || 'Something went wrong.'; msg.classList.add('err'); }
        })
        .catch(function () { if (btn) btn.disabled = false; if (msg) { msg.textContent = 'Network problem. Try again.'; msg.classList.add('err'); } });
    });
  }
  document.querySelectorAll('form[data-signup], form[data-ajax]').forEach(wire);
  // Reminder form: people who subscribed in this browser do not need the Sunday email checkbox.
  try { if (localStorage.getItem('watch-sub') === '1') document.querySelectorAll('[data-remind-join]').forEach(function (el) { el.hidden = true; }); } catch (e) {}

  // Submit form: reveal the new organization field
  var orgSel = document.querySelector('select[name="organization_slug"]');
  var newOrg = document.querySelector('.new-org');
  if (orgSel && newOrg) {
    var sync = function () { newOrg.hidden = orgSel.value !== '__new'; };
    orgSel.addEventListener('change', sync); sync();
  }

  // Limit topic chips to three on the submit form
  var chips = document.querySelectorAll('.big-form .topics input[type="checkbox"]');
  if (chips.length) {
    chips.forEach(function (c) { c.addEventListener('change', function () {
      var n = Array.prototype.filter.call(chips, function (x) { return x.checked; }).length;
      chips.forEach(function (x) { if (!x.checked) x.disabled = n >= 3; });
    }); });
  }

  // Close the add-to-calendar menu when clicking elsewhere
  document.addEventListener('click', function (e) {
    document.querySelectorAll('details.add-cal[open]').forEach(function (d) { if (!d.contains(e.target)) d.removeAttribute('open'); });
  });
})();

// Virtual calendar: render UTC instants in the viewer's chosen zone and group by day.
(function () {
  var list = document.querySelector('[data-virtual-list]');
  var sel = document.getElementById('tz-select');
  if (!list || !sel) return;
  var KEY = 'watch-tz';
  var saved = null; try { saved = localStorage.getItem(KEY); } catch (e) {}
  if (saved) sel.value = saved;
  function zone() { var v = sel.value; return v === 'auto' ? (Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Los_Angeles') : v; }
  function render() {
    var tz = zone();
    var dayFmt = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'long', month: 'short', day: 'numeric' });
    var keyFmt = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' });
    var timeFmt = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });
    var tFmt = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit' });
    var lastKey = null;
    list.querySelectorAll('.day-sep').forEach(function (n) { n.remove(); });
    list.querySelectorAll('.virtual-row').forEach(function (row) {
      var s = new Date(row.getAttribute('data-start')); var eAttr = row.getAttribute('data-end'); var en = eAttr ? new Date(eAttr) : null;
      var k = keyFmt.format(s);
      if (k !== lastKey) {
        var sep = document.createElement('li'); sep.className = 'day-sep'; sep.textContent = dayFmt.format(s); row.parentNode.insertBefore(sep, row); lastKey = k;
      }
      var t = row.querySelector('[data-tz-time]'); var d = row.querySelector('[data-tz-date]');
      if (d) d.textContent = '';
      if (t) t.textContent = en ? (tFmt.format(s) + ' to ' + timeFmt.format(en)) : timeFmt.format(s);
    });
    var opt = sel.querySelector('option[value="auto"]'); if (opt) opt.textContent = 'My time zone (' + (Intl.DateTimeFormat().resolvedOptions().timeZone || 'local') + ')';
  }
  sel.addEventListener('change', function () { try { localStorage.setItem(KEY, sel.value); } catch (e) {} render(); });
  render();
  // Checkboxes that mean "off" when unchecked: submit an explicit 0 so the default can be on.
  var form = sel.closest('form');
  if (form) form.addEventListener('submit', function () {
    form.querySelectorAll('input[type="checkbox"][data-off-value]').forEach(function (cb) {
      if (!cb.checked) { var h = document.createElement('input'); h.type = 'hidden'; h.name = cb.name; h.value = cb.getAttribute('data-off-value'); form.appendChild(h); }
    });
    sel.disabled = true; // don't submit the zone picker
  });
})();

// Event page: show a virtual session's time in the viewer's own zone.
(function () {
  var el = document.querySelector('[data-local-time]');
  if (!el) return;
  try {
    var tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    var s = new Date(el.getAttribute('data-start')); var eAttr = el.getAttribute('data-end'); var en = eAttr ? new Date(eAttr) : null;
    var f = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });
    var t = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });
    el.textContent = 'In your time zone: ' + f.format(s) + (en ? ' to ' + t.format(en) : '');
  } catch (e) {}
})();
