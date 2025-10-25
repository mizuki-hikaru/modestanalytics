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

    var startTime = Date.now(); // Record start time when script loads
    var initialReferrer = document.referrer || ''; // Record initial referrer, default to empty string

    function sendPageviewOnUnload() {
      var loc = window.location || {};
      var domain = loc.hostname || '';
      var path = pathWithQuery(loc);
      var timeSpentOnPage = Math.round((Date.now() - startTime) / 1000); // Time in seconds, always a number

      var params = new URLSearchParams();
      params.append('token', token);
      params.append('domain', domain);
      params.append('path', path);
      params.append('referrer', initialReferrer);
      params.append('time_spent_on_page', timeSpentOnPage);

      // Always use fetch with credentials: 'include' to ensure cookies are sent
      try {
        fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: params.toString(),
          keepalive: true,
          mode: 'cors',
          credentials: 'include'
        }).catch(function () {});
      } catch (_) {}
    }

    // Attach the event listener to send data when the page is about to be unloaded
    window.addEventListener('beforeunload', sendPageviewOnUnload);

  } catch (_) {}
})();
