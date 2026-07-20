(function () {
  function setActive(root) {
    var path = window.location.pathname.replace(/\/$/, '') || '/';
    var items = root.querySelectorAll('.app-sb-item');
    items.forEach(function (el) {
      var p = el.getAttribute('data-path') || '';
      el.classList.toggle('active', p === path);
    });
  }

  function wireSignout(root) {
    var btn = root.querySelector('#appSbSignout');
    if (!btn) return;
    btn.addEventListener('click', function () {
      try {
        if (window.firebase && firebase.auth) {
          firebase.auth().signOut().finally(function () { window.location.href = '/login'; });
          return;
        }
      } catch (e) {}
      window.location.href = '/login';
    });
  }

  function init() {
    fetch('/dashboard/app-sidebar-partial.html')
      .then(function (r) { return r.text(); })
      .then(function (html) {
        var wrap = document.createElement('div');
        wrap.innerHTML = html;
        var nav = wrap.firstElementChild;
        document.body.insertBefore(nav, document.body.firstChild);
        document.body.classList.add('has-app-sb');
        setActive(nav);
        wireSignout(nav);
      })
      .catch(function () { /* fail quietly — page still works without the sidebar */ });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
