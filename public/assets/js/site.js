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
            if (form.hasAttribute('data-signup') && j.next) { window.location.href = j.next; return; }
            if (msg) { msg.textContent = j.message || 'Done.'; msg.classList.add('ok'); }
            if (!form.hasAttribute('data-keep')) form.reset();
          } else if (msg) { msg.textContent = j.error || 'Something went wrong.'; msg.classList.add('err'); }
        })
        .catch(function () { if (btn) btn.disabled = false; if (msg) { msg.textContent = 'Network problem. Try again.'; msg.classList.add('err'); } });
    });
  }
  document.querySelectorAll('form[data-signup], form[data-ajax]').forEach(wire);

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
