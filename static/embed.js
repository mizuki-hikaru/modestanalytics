(async function () {
  try {
    let scriptEl = document.currentScript;
    if (!scriptEl) {
      const scripts = document.getElementsByTagName('script');
      for (let i = scripts.length - 1; i >= 0; i--) {
        if (scripts[i].src && /^https:\/\/modestanalytics.com\/embed\.js(\?.*)?$/.test(scripts[i].src)) {
          scriptEl = scripts[i];
          break;
        }
      }
    }
    if (!scriptEl) return;

    const pageviewEndpoint = 'https://modestanalytics.com/pageview';
    const heartbeatEndpoint = 'https://modestanalytics.com/heartbeat';
    const userToken = scriptEl.dataset.token || '';
    let pageviewToken = null;
    if (!pageviewEndpoint || !heartbeatEndpoint || !userToken) return;

    function pathWithQuery(loc) {
      try {
        return (loc.pathname || '/') + (loc.search || '');
      } catch (_) {
        return '/';
      }
    }

    const startTime = Date.now(); // Record start time when script loads
    const initialReferrer = document.referrer || ''; // Record initial referrer, default to empty string

    const loc = window.location || {};
    const domain = loc.hostname || '';
    const path = pathWithQuery(loc);

    const params = new URLSearchParams();
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

      const params = new URLSearchParams();
      params.append('token', pageviewToken);
      params.append('time_spent_on_page', timeSpentOnPage);

      // Try to use sendBeacon first
      if (navigator.sendBeacon && navigator.sendBeacon(heartbeatEndpoint, params)) {
        // Data successfully queued by sendBeacon
      } else {
        // sendBeacon not available or failed, use fetch as fallback
        try {
          fetch(heartbeatEndpoint, {
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
