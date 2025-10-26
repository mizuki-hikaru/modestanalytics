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

    // Generate a random 128-bit token (represented as ASCII) for pageview tracking
    var viewId = Array.from(crypto.getRandomValues(new Uint8Array(16)))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    function pathWithQuery(loc) {
      try {
        return (loc.pathname || '/') + (loc.search || '');
      } catch (_) {
        return '/';
      }
    }

    var startTime = Date.now(); // Record start time when script loads
    var initialReferrer = document.referrer || ''; // Record initial referrer, default to empty string

    function sendPageview() {
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
      params.append('view_id', viewId);

      // Try to use sendBeacon first
      if (navigator.sendBeacon && navigator.sendBeacon(endpoint, params)) {
        // Data successfully queued by sendBeacon
      } else {
        // sendBeacon not available or failed, use fetch as fallback
        try {
          fetch(endpoint, {
            method: 'POST',
            body: params,
            keepalive: true,
          }).catch(function () {});
        } catch (e) {
          // Fallback for older browsers that might not support fetch or sendBeacon
        }
      }
    }

    // Send initial pageview immediately
    sendPageview();

    // Send pageview data every 5 seconds
    setInterval(sendPageview, 5000);

  } catch (_) {}
})();
