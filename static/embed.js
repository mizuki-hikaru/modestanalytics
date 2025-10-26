(async function () {
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

    var pageviewEndpoint = 'https://modestanalytics.com/pageview';
    var heartbeatEndpoint = 'https://modestanalytics.com/heartbeat';
    var userToken = scriptEl.dataset.token || '';
    var pageviewToken = null;
    if (!pageviewEndpoint || !heartbeatEndpoint || !userToken) return;

    function pathWithQuery(loc) {
      try {
        return (loc.pathname || '/') + (loc.search || '');
      } catch (_) {
        return '/';
      }
    }

    var startTime = Date.now(); // Record start time when script loads
    var initialReferrer = document.referrer || ''; // Record initial referrer, default to empty string

    var loc = window.location || {};
    var domain = loc.hostname || '';
    var path = pathWithQuery(loc);

    var params = new URLSearchParams();
    params.append('token', userToken);
    params.append('domain', domain);
    params.append('path', path);
    params.append('referrer', initialReferrer);

    try {
      const response = await fetch(pageviewEndpoint, {
        method: 'POST',
        body: params,
        keepalive: true,
      });
      const data = await response.json();
      pageviewToken = data.token || '';
    } catch (_) {}

    function sendHeartbeat() {
      if (!pageviewToken) return;
      const timeSpentOnPage = Math.floor((Date.now() - startTime) / 1000);

      var params = new URLSearchParams();
      params.append('token', pageviewToken);
      params.append('time_spent_on_page', timeSpentOnPage);

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

    // Send heartbeat data every 5 seconds
    setInterval(sendHeartbeat, 5000);

  } catch (_) {}
})();
