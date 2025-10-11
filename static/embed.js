(function () {
  try {
    var scriptEl = document.currentScript;
    if (!scriptEl) {
      var scripts = document.getElementsByTagName('script');
      for (var i = scripts.length - 1; i >= 0; i--) {
        if (scripts[i].src && /embed\.js(\?.*)?$/.test(scripts[i].src)) {
          scriptEl = scripts[i];
          break;
        }
      }
    }
    if (!scriptEl) return;

    var endpoint = 'https://modestanalytics.com/pageview';
    var token = scriptEl.dataset.token || '';
    if (!endpoint || !token) return;

    function pathWithQuery(loc) {
      try {
        return (loc.pathname || '/') + (loc.search || '');
      } catch (_) {
        return '/';
      }
    }

    var lastSent = '';
    function sendPageview() {
      var loc = window.location || {};
      var domain = loc.hostname || '';
      var path = pathWithQuery(loc);
      var key = domain + ' ' + path;
      if (key === lastSent) return;
      lastSent = key;

      var payload = JSON.stringify({ token: token, domain: domain, path: path });

      if (navigator && typeof navigator.sendBeacon === 'function') {
        try {
          var blob = new Blob([payload], { type: 'application/json' });
          var ok = navigator.sendBeacon(endpoint, blob);
          if (ok) return;
        } catch (_) {}
      }

      try {
        fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: payload,
          keepalive: true,
          mode: 'cors',
          credentials: 'omit'
        }).catch(function () {});
      } catch (_) {}
    }

    if (document.readyState === 'complete' || document.readyState === 'interactive') {
      setTimeout(sendPageview, 0);
    } else {
      document.addEventListener('DOMContentLoaded', sendPageview);
    }

    function hookHistory(methodName) {
      try {
        var orig = history[methodName];
        if (typeof orig !== 'function') return;
        history[methodName] = function () {
          var ret = orig.apply(this, arguments);
          try {
            window.dispatchEvent(new Event('modestanalytics:navigation'));
          } catch (_) {}
          return ret;
        };
      } catch (_) {}
    }

    hookHistory('pushState');
    hookHistory('replaceState');

    var lastPath = pathWithQuery(window.location || {});
    function maybeSendOnNav() {
      var p = pathWithQuery(window.location || {});
      if (p !== lastPath) {
        lastPath = p;
        sendPageview();
      }
    }

    window.addEventListener('popstate', maybeSendOnNav);
    window.addEventListener('modestanalytics:navigation', maybeSendOnNav);

    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible') {
        maybeSendOnNav();
      }
    });
  } catch (_) {}
})();
