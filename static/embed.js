let pageviewToken = null;
const pageviewEndpoint = 'https://modestanalytics.com/pageview';
const heartbeatEndpoint = 'https://modestanalytics.com/heartbeat';
const deletePageviewEndpoint = 'https://modestanalytics.com/pageview/delete';
function installAnalyticsSquare() {
  if (!document.getElementById('analyticsSquare')) {
    const square = document.createElement('div');
    square.id = 'analyticsSquare';
    square.style = 'position: fixed; top: 0; left: 0; width: 1em; height: 1em; background-color: rgba(0, 0, 0, 0.5); z-index: 1000000;';
    document.body.appendChild(square);
  }
}
async function deletePageview() {
  if (!pageviewToken) return;
  try {
    await fetch(deletePageviewEndpoint, {
      method: 'POST',
      body: new URLSearchParams({ token: pageviewToken }),
      keepalive: true,
    });
  } catch (_) {}
}
function analyticsOptOut() {
  localStorage.setItem('analyticsOptOut', 'true');
  installAnalyticsSquare();
  deletePageview();
  alert('Analytics opt-out set for this site.');
}
(async function () {
  try {
    function isOptOut() {
      return localStorage.getItem('analyticsOptOut') === "true";
    }
    if (isOptOut()) {
      document.addEventListener('DOMContentLoaded', function () {
        installAnalyticsSquare();
      });
      return;
    }
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

    const userToken = scriptEl.dataset.token || '';
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
    let timeSpentOnPage = 0;
    let lastActivityTime = Date.now(); // Initialize last activity time

    // Update lastActivityTime on user interaction
    function updateActivityTime() {
      lastActivityTime = Date.now();
    }

    document.addEventListener('mousemove', updateActivityTime);
    document.addEventListener('keydown', updateActivityTime);
    document.addEventListener('scroll', updateActivityTime);

    const loc = window.location || {};
    const domain = loc.hostname;
    const path = pathWithQuery(loc);

    if (!domain) return;

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

    function heartbeat() {
      if (!pageviewToken) return;
      if (isOptOut()) return;

      if (lastActivityTime > Date.now() - 30000) {
        timeSpentOnPage += 4;
      }

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

    // calculate and send heartbeat data every 4 seconds
    setInterval(heartbeat, 4000);

  } catch (_) {}
})();
