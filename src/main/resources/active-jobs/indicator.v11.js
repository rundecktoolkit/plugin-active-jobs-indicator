(function () {
  'use strict';

  var INDICATOR_ID = 'ajni-indicator-item';
  var LINK_ID = 'ajni-indicator-link';
  var ICON_ID = 'ajni-indicator-icon';
  var BADGE_ID = 'ajni-indicator-badge';

  var POLL_MS = 2000;
  var FETCH_TIMEOUT_MS = 2500;
  var PENDING_TTL_MS = 3500;
  var RUNNING_MAX = 200;
  var API_VERSION = String((window._rundeck && window._rundeck.apiVersion) || '57');

  function byId(id) {
    return document.getElementById(id);
  }

  function ensureInlineStyles() {
    if (byId('ajni-inline-style')) {
      return;
    }
    var style = document.createElement('style');
    style.id = 'ajni-inline-style';
    style.type = 'text/css';
    style.textContent = [
      '#navbar-menu #ajni-indicator-item { margin-right: 4px; }',
      '#navbar-menu #ajni-indicator-link { display:inline-flex;align-items:center;justify-content:center;min-width:26px;min-height:26px;position:relative;text-decoration:none;cursor:pointer; }',
      '#navbar-menu #ajni-indicator-link:focus { outline:2px solid #5b9dd9; outline-offset:1px; }',
      '#navbar-menu #ajni-indicator-item .ajni-icon { opacity:0.85; }',
      '#navbar-menu #ajni-indicator-item.ajni-active .ajni-icon { opacity:1; }',
      '@keyframes ajni-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }',
      '#navbar-menu #ajni-indicator-item .ajni-icon.ajni-rotating { animation: ajni-spin 0.9s linear infinite; transform-origin: 50% 50%; }',
      '#navbar-menu #ajni-indicator-link .ajni-badge { position:absolute;top:-6px;right:-8px;min-width:16px;height:16px;padding:0 4px;border-radius:999px;display:inline-flex;align-items:center;justify-content:center;background:#d63d2e;color:#fff;font-size:10px;font-weight:700;line-height:1;box-shadow:0 0 0 2px #fff; }'
    ].join('\n');
    document.head.appendChild(style);
  }

  function baseUrl() {
    var rd = window._rundeck || {};
    var base = rd.rdBase || '/';
    try {
      if (/^https?:\/\//i.test(base)) {
        var parsed = new URL(base);
        base = parsed.pathname || '/';
      }
    } catch (_e) {
      base = '/';
    }
    if (!base.startsWith('/')) {
      base = '/' + base;
    }
    return base.endsWith('/') ? base : base + '/';
  }

  function currentProject() {
    var rd = window._rundeck || {};
    var project = rd.projectName ||
      (window.appLinks && window.appLinks.project_name) ||
      new URLSearchParams(window.location.search).get('project');
    if (project) {
      return project;
    }
    var match = (window.location.pathname || '').match(/\/project\/([^/]+)/);
    if (match && match[1]) {
      try {
        return decodeURIComponent(match[1]);
      } catch (_e) {
        return match[1];
      }
    }
    return null;
  }

  function runningApiUrl(projectName) {
    var targetProject = projectName && projectName.length > 0 ? projectName : '*';
    var encodedProject = targetProject === '*' ? '*' : encodeURIComponent(targetProject);
    return baseUrl() + 'api/' + API_VERSION + '/project/' + encodedProject + '/executions/running?max=' + RUNNING_MAX + '&includePostponed=true&_ts=' + Date.now();
  }

  function runningViewUrl() {
    var project = currentProject();
    if (project) {
      return baseUrl() + 'reports/index?project=' + encodeURIComponent(project) + '&runningFilter=running';
    }
    return baseUrl() + 'menu/home';
  }

  function setTooltip(el, text) {
    el.setAttribute('title', text);
    el.setAttribute('aria-label', text);
    try {
      if (window.jQuery && window.jQuery(el).tooltip) {
        window.jQuery(el).attr('data-original-title', text).tooltip('fixTitle');
      }
    } catch (_tooltipErr) {
      // Ignore tooltip plugin differences across pages.
    }
  }

  function ensureIndicator() {
    if (byId(INDICATOR_ID)) {
      return byId(INDICATOR_ID);
    }
    var admin = byId('appAdmin');
    if (!admin || !admin.parentNode) {
      return null;
    }

    var li = document.createElement('li');
    li.id = INDICATOR_ID;
    li.className = 'user-button';

    var link = document.createElement('a');
    link.id = LINK_ID;
    link.href = '#';
    link.setAttribute('role', 'button');
    link.className = 'has_tooltip';
    link.setAttribute('data-toggle', 'tooltip');
    link.setAttribute('data-placement', 'bottom');

    var icon = document.createElement('i');
    icon.id = ICON_ID;
    icon.className = 'fas fa-sync fa-lg ajni-icon text-muted';
    icon.setAttribute('aria-hidden', 'true');

    var badge = document.createElement('span');
    badge.id = BADGE_ID;
    badge.className = 'ajni-badge';
    badge.setAttribute('aria-hidden', 'true');
    badge.style.display = 'none';

    link.appendChild(icon);
    link.appendChild(badge);
    li.appendChild(link);
    admin.parentNode.insertBefore(li, admin);

    if (window.jQuery && window.jQuery(link).tooltip) {
      window.jQuery(link).tooltip();
    }
    return li;
  }

  function formatCount(count) {
    return count > 99 ? '99+' : String(count);
  }

  function readUiRequestToken() {
    var ids = ['web_ui_token', 'ui_token', 'uiplugin_tokens'];
    for (var i = 0; i < ids.length; i++) {
      var el = byId(ids[i]);
      if (!el) {
        continue;
      }
      var raw = (el.textContent || el.innerText || '').trim();
      if (!raw) {
        continue;
      }
      try {
        var parsed = JSON.parse(raw);
        if (parsed && parsed.TOKEN && parsed.URI) {
          return parsed;
        }
      } catch (_e) {}
    }
    return null;
  }

  function extractRunningData(data) {
    var result = { count: 0 };
    if (!data) {
      return result;
    }

    var executions = Array.isArray(data.executions) ? data.executions : (Array.isArray(data) ? data : []);
    var count = 0;
    if (data.paging && typeof data.paging.total === 'number') {
      count = Math.max(data.paging.total, executions.length);
    } else {
      count = executions.length;
    }

    result.count = Math.max(0, Number(count) || 0);
    return result;
  }

  function fetchJsonWithTimeout(url, timeoutMs) {
    var token = readUiRequestToken();
    var headers = {
      Accept: 'application/json',
      'x-rundeck-ajax': 'true'
    };
    if (token) {
      headers['X-RUNDECK-TOKEN-KEY'] = token.TOKEN;
      headers['X-RUNDECK-TOKEN-URI'] = token.URI;
    }

    if (window.jQuery && window.jQuery.ajax) {
      return new Promise(function (resolve, reject) {
        window.jQuery.ajax({
          url: url,
          type: 'GET',
          cache: false,
          timeout: timeoutMs,
          dataType: 'json',
          headers: headers,
          success: function (data, _textStatus, xhr) {
            if (data && Object.prototype.hasOwnProperty.call(data, 'error') && data.error) {
              var apiErr = new Error('api error');
              apiErr.status = xhr && xhr.status ? xhr.status : 500;
              reject(apiErr);
              return;
            }
            resolve({
              status: xhr && xhr.status ? xhr.status : 200,
              data: data
            });
          },
          error: function (xhr, _status, err) {
            var reqErr = new Error(err || 'request failed');
            reqErr.status = xhr && xhr.status ? xhr.status : 0;
            reject(reqErr);
          }
        });
      });
    }

    return new Promise(function (resolve, reject) {
      var timer = null;
      var controller = null;
      if (window.AbortController) {
        controller = new AbortController();
        timer = window.setTimeout(function () {
          try {
            controller.abort();
          } catch (_e) {}
        }, timeoutMs);
      }
      fetch(url, {
        method: 'GET',
        headers: headers,
        credentials: 'same-origin',
        cache: 'no-store',
        signal: controller ? controller.signal : undefined
      }).then(function (res) {
        if (timer) {
          window.clearTimeout(timer);
        }
        if (!res.ok) {
          var err = new Error('request failed');
          err.status = res.status;
          throw err;
        }
        return res.json().then(function (data) {
          if (data && Object.prototype.hasOwnProperty.call(data, 'error') && data.error) {
            var apiErr = new Error('api error');
            apiErr.status = res.status;
            throw apiErr;
          }
          return {
            status: res.status,
            data: data
          };
        });
      }).then(resolve).catch(function (err) {
        if (timer) {
          window.clearTimeout(timer);
        }
        if (err && err.name === 'AbortError') {
          var timeoutErr = new Error('request timeout');
          timeoutErr.status = 0;
          reject(timeoutErr);
          return;
        }
        reject(err);
      });
    });
  }

  function fetchRunningData(projectName) {
    return fetchJsonWithTimeout(runningApiUrl(projectName), FETCH_TIMEOUT_MS)
      .then(function (res) {
        return {
          status: res.status,
          parsed: extractRunningData(res.data)
        };
      });
  }

  function init() {
    ensureInlineStyles();

    var item = ensureIndicator();
    if (!item) {
      return;
    }
    if (item.getAttribute('data-ajni-bound') === 'true') {
      return;
    }
    item.setAttribute('data-ajni-bound', 'true');

    var state = {
      loading: false,
      runningCount: 0,
      lastCheckedAt: null,
      lastError: null,
      pendingUntil: 0,
      lastApiStatus: 0,
      lastApiCount: 0
    };
    window.__ajniIndicatorState = state;

    function render() {
      var item = byId(INDICATOR_ID) || ensureIndicator();
      var link = byId(LINK_ID);
      var icon = byId(ICON_ID);
      var badge = byId(BADGE_ID);
      if (!item || !link || !icon || !badge) {
        return;
      }
      if (item.getAttribute('data-ajni-bound') !== 'true') {
        item.setAttribute('data-ajni-bound', 'true');
      }

      var now = Date.now();
      var pendingActive = now < state.pendingUntil;
      var effectiveCount = Math.max(state.runningCount, pendingActive ? 1 : 0);
      var hasActive = effectiveCount > 0;

      item.classList.remove('ajni-active', 'ajni-error');
      icon.className = 'fas fa-sync fa-lg ajni-icon';
      icon.style.animation = '';
      icon.style.transformOrigin = '';
      badge.style.display = 'none';
      badge.textContent = '';

      if (hasActive) {
        item.classList.add('ajni-active');
        icon.classList.add('fa-sync', 'ajni-rotating', 'text-warning');
        icon.style.animation = 'ajni-spin 0.9s linear infinite';
        icon.style.transformOrigin = '50% 50%';
        badge.style.display = 'inline-flex';
        badge.textContent = formatCount(effectiveCount);

        var base = effectiveCount === 1 ? '1 execution running.' : effectiveCount + ' executions running.';
        setTooltip(link, base);
        return;
      }

      if (state.lastError) {
        item.classList.add('ajni-error');
        icon.className = 'fas fa-exclamation-triangle fa-lg ajni-icon text-danger';
        setTooltip(link, 'Unable to verify running jobs.');
        return;
      }

      icon.classList.add('fa-sync', 'text-muted');
      setTooltip(link, state.lastCheckedAt ? '0 executions running.' : 'Checking running executions...');
    }

    function markPendingRun() {
      state.pendingUntil = Date.now() + PENDING_TTL_MS;
      render();
      window.setTimeout(refresh, 150);
      window.setTimeout(refresh, 1200);
    }

    function applyRunningResult(result) {
      state.runningCount = result.parsed.count;
      state.lastApiCount = result.parsed.count;
      state.lastApiStatus = result.status;
      state.lastCheckedAt = new Date();
      state.lastError = null;
      if (result.parsed.count > 0) {
        state.pendingUntil = 0;
      }
    }

    function refresh() {
      if (state.loading) {
        return;
      }
      state.loading = true;

      var project = currentProject();
      fetchRunningData('*')
        .then(function (res) {
          applyRunningResult(res);
        })
        .catch(function (err) {
          if (project) {
            return fetchRunningData(project)
              .then(function (res) {
                applyRunningResult(res);
              });
          }
          throw err;
        })
        .catch(function (err) {
          state.lastError = err;
        })
        .finally(function () {
          state.loading = false;
          render();
        });
    }

    function isRunRequestUrl(url) {
      var u = String(url || '');
      return (
        u.indexOf('/scheduledExecution/execute') >= 0 ||
        u.indexOf('/scheduledExecution/runJobInline') >= 0 ||
        u.indexOf('/job/runJobInline') >= 0 ||
        u.indexOf('/job/runJobNow') >= 0 ||
        (u.indexOf('/api/') >= 0 && u.indexOf('/job/') >= 0 && u.indexOf('/run') >= 0)
      );
    }

    function onActivate(event) {
      event.preventDefault();
      if (state.runningCount > 0) {
        window.location.assign(runningViewUrl());
        return;
      }
      refresh();
    }

    document.addEventListener('click', function (event) {
      var target = event.target;
      if (!target) {
        return;
      }
      if (target.closest('#' + LINK_ID)) {
        onActivate(event);
        return;
      }
      if (
        target.closest('.act_execute_job') ||
        target.closest('#execFormRunButton') ||
        target.closest('[name="_action_runJobNow"]') ||
        target.closest('form[action*="scheduledExecution/execute"]') ||
        target.closest('form[action*="scheduledExecution/runJobInline"]') ||
        target.closest('form[action*="job/runJobInline"]') ||
        target.closest('form[action*="job/runJobNow"]')
      ) {
        markPendingRun();
      }
    });

    document.addEventListener('keydown', function (event) {
      var target = event.target;
      if (!target) {
        return;
      }
      if ((event.key === 'Enter' || event.key === ' ') && target.closest('#' + LINK_ID)) {
        onActivate(event);
      }
    });

    document.addEventListener('submit', function (event) {
      var form = event.target;
      if (
        form &&
        form.matches &&
        (
          form.matches('form[action*="scheduledExecution/execute"]') ||
          form.matches('form[action*="scheduledExecution/runJobInline"]') ||
          form.matches('form[action*="job/runJobInline"]') ||
          form.matches('form[action*="job/runJobNow"]')
        )
      ) {
        markPendingRun();
      }
    });

    if (window.jQuery) {
      window.jQuery(document).ajaxSuccess(function (_event, xhr, settings) {
        var url = (settings && settings.url) || '';
        if (isRunRequestUrl(url) && xhr && xhr.status >= 200 && xhr.status < 300) {
          markPendingRun();
        }
      });
    }

    if (window._rundeck && window._rundeck.eventBus && typeof window._rundeck.eventBus.on === 'function') {
      window._rundeck.eventBus.on('activity-nowrunning-count', function (count) {
        var c = Math.max(0, Number(count) || 0);
        if (c > 0) {
          state.runningCount = Math.max(state.runningCount, c);
          state.pendingUntil = 0;
          state.lastCheckedAt = new Date();
          state.lastError = null;
          render();
          window.setTimeout(refresh, 80);
          return;
        }
        window.setTimeout(refresh, 100);
      });
    }

    window.addEventListener('ajni-force-active', function (event) {
      var detail = event && event.detail ? event.detail : {};
      var c = Math.max(0, Number(detail.count) || 0);
      if (c > 0) {
        state.runningCount = Math.max(state.runningCount, c);
        state.pendingUntil = Date.now() + PENDING_TTL_MS;
        state.lastCheckedAt = new Date();
        state.lastError = null;
        render();
        window.setTimeout(refresh, 100);
        return;
      }
      window.setTimeout(refresh, 120);
    });

    var timer = window.setInterval(refresh, POLL_MS);
    window.addEventListener('beforeunload', function () {
      if (timer) {
        window.clearInterval(timer);
      }
    });

    render();
    refresh();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
  window.addEventListener('load.rundeck.page', init);
})();
