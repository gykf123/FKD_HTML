/* =============================================================================
 * FKD 网络韧性层 (net-guard) v1.0
 * -----------------------------------------------------------------------------
 * 目的：缓解境外 Supabase 节点在国内偶发不可达；为「多端点反代」预留接入点。
 *
 * 加载位置：必须在 app.js 之前（见 index.html）。app.js 的 installAuthGuard 会
 * 二次包装 window.fetch，本文件必须在内层，这样 URL 改写不会影响它基于原始
 * URL 的 401 判断。调用链：业务 -> authGuard(外) -> netGuard(内) -> 原生 fetch。
 *
 * 设计原则：
 *   1. 零侵入：不改任何业务代码、不依赖业务变量、不部署后端。
 *   2. 默认零副作用：只配了 1 个端点时，行为与原版几乎一致。
 *   3. 写操作绝不重试：签到/投稿/赠送/评论都是 POST，重试会重复扣分或重复发帖。
 *   4. 绝不缓存用户态响应：只缓存匿名公开 GET，且不缓存 storage 二进制。
 *   5. 全 ES5 语法，兼容老 iPad Safari（不用可选链 / AbortSignal.any）。
 *
 * 配置端点（部署反代后任选一种，无需改本文件）：
 *   A) 全局注入（需在页面脚本前）：
 *      <script>window.FKD_NET_ENDPOINTS = ['https://主域名', 'https://反代1', 'https://反代2'];</script>
 *   B) 控制台即时生效：
 *      FKD_NET.setEndpoints(['https://...','https://...'])
 *   C) 持久化：localStorage.setItem('fkd_net_endpoints', JSON.stringify([...]))
 *
 * 调试：FKD_NET.stats() / FKD_NET.endpoints() / FKD_NET.active() / FKD_NET.probe()
 * ============================================================================= */
(function () {
  'use strict';

  // ------------------------------ 配置 ------------------------------
  var PRIMARY = 'https://yowwyasttkywyqgseuqz.supabase.co';
  var ANON = 'sb_publishable_j4rpi2ejPTMGxo79uaaX3g_kQYrinS4';

  var TIMEOUT_GET = 8000;      // 读请求超时
  var TIMEOUT_WRITE = 15000;   // 写/上传请求超时（图片上传较慢）
  var PROBE_TIMEOUT = 3000;    // 端点竞速探测超时
  var CACHE_TTL = 10 * 60 * 1000;
  var CACHE_MAX = 40;

  var LS_ENDPOINTS = 'fkd_net_endpoints';
  var LS_ACTIVE = 'fkd_net_active';
  var LS_CACHE = 'fkd_net_cache_v1';

  // ------------------------------ 状态 ------------------------------
  var _raw = window.fetch.bind(window);
  var endpoints = readEndpoints();
  var activeEp = readActive();
  var fails = {};              // 每个端点连续失败次数
  var successAt = {};          // 每个端点最近成功时间
  var statsBuf = [];           // 环形统计
  var probeDone = false;
  var onDegraded = null;       // 可选回调

  // 自动诊断相关
  var DIAG_URL = 'diag.html';
  var DIAG_COOL_MS = 10 * 60 * 1000;   // 10 分钟内只自动跳一次，避免连环跳
  var DIAG_THRESHOLD = 3;              // 连续 3 次网络层失败才跳（单次抖动不打扰）
  var DIAG_WINDOW_MS = 12000;          // 只在首屏 12 秒内触发：后台刷新失败不该把用户踢走
  var netFailStreak = 0;
  var bootAt = Date.now();

  // --------------------------- 端点配置 ---------------------------
  function norm(u) {
    if (typeof u !== 'string') return '';
    u = u.trim().replace(/\/+$/, '');
    return /^https:\/\//i.test(u) ? u : '';
  }

  function readEndpoints() {
    var list = null;
    try { if (Object.prototype.toString.call(window.FKD_NET_ENDPOINTS) === '[object Array]') list = window.FKD_NET_ENDPOINTS.slice(); } catch (e) {}
    if (!list) {
      try {
        var s = localStorage.getItem(LS_ENDPOINTS);
        if (s) list = JSON.parse(s);
      } catch (e) {}
    }
    if (Object.prototype.toString.call(list) !== '[object Array]' || !list.length) list = [PRIMARY];

    var out = [], i, n;
    for (i = 0; i < list.length; i++) {
      n = norm(list[i]);
      if (n && out.indexOf(n) === -1) out.push(n);
    }
    if (!out.length) out = [PRIMARY];
    // 主端点必须在列（作为兜底），但不强制排第一，允许把更稳的反代放首位
    if (out.indexOf(PRIMARY) === -1) out.push(PRIMARY);
    return out;
  }

  function readActive() {
    try {
      var s = localStorage.getItem(LS_ACTIVE);
      if (s && endpoints.indexOf(s) !== -1) return s;
    } catch (e) {}
    return endpoints[0];
  }

  function saveActive(ep) {
    activeEp = ep;
    try { localStorage.setItem(LS_ACTIVE, ep); } catch (e) {}
  }

  function currentEp() {
    return endpoints.indexOf(activeEp) !== -1 ? activeEp : endpoints[0];
  }

  function isOurRequest(url) {
    // 只认本项目端点前缀；第三方图床 sm.ms / imgtp.com 一律原样透传
    var i;
    for (i = 0; i < endpoints.length; i++) {
      if (url.indexOf(endpoints[i]) === 0) return true;
    }
    return url.indexOf(PRIMARY) === 0;
  }

  function rewrite(url, ep) {
    var i, base;
    for (i = 0; i < endpoints.length; i++) {
      base = endpoints[i];
      if (url.indexOf(base) === 0) return ep + url.slice(base.length);
    }
    if (url.indexOf(PRIMARY) === 0) return ep + url.slice(PRIMARY.length);
    return url;
  }

  function switchEndpoint() {
    if (endpoints.length < 2) return false;
    var start = endpoints.indexOf(currentEp());
    var best = -1, bestFails = 1e9, i, idx, f;
    for (i = 1; i <= endpoints.length; i++) {
      idx = (start + i) % endpoints.length;
      if (idx === start) continue;
      f = fails[endpoints[idx]] || 0;
      if (f < bestFails) { bestFails = f; best = idx; }
    }
    if (best < 0) return false;
    saveActive(endpoints[best]);
    return true;
  }

  function markOk(ep) { fails[ep] = 0; successAt[ep] = Date.now(); }
  function markFail(ep) { fails[ep] = (fails[ep] || 0) + 1; }

  // --------------------------- GET 缓存 ---------------------------
  function urlKey(url) {
    var i = url.indexOf('/rest/v1/');
    if (i < 0) return null;
    return url.slice(i);
  }

  function headerVal(headers, name) {
    if (!headers) return '';
    try {
      if (typeof Headers !== 'undefined' && headers instanceof Headers) return headers.get(name) || '';
      if (Object.prototype.toString.call(headers) === '[object Array]') {
        for (var i = 0; i < headers.length; i++) {
          if (String(headers[i][0]).toLowerCase() === name.toLowerCase()) return String(headers[i][1]);
        }
        return '';
      }
      var k;
      for (k in headers) {
        if (Object.prototype.hasOwnProperty.call(headers, k) && k.toLowerCase() === name.toLowerCase()) return String(headers[k]);
      }
    } catch (e) {}
    return '';
  }

  // 只缓存「匿名公开 GET」：无 Authorization，或 Authorization 就是 anon key。
  // 带用户 JWT 的响应一律不缓存（隐私 + 避免串号）。
  function cacheable(init, isRequest) {
    var auth = isRequest ? '' : headerVal(init && init.headers, 'Authorization');
    if (!auth) return true;
    return auth.indexOf(ANON) !== -1;
  }

  function readCache() {
    try {
      var o = JSON.parse(localStorage.getItem(LS_CACHE) || '{}');
      return (o && typeof o === 'object') ? o : {};
    } catch (e) { return {}; }
  }

  function putCache(key, body) {
    try {
      var o = readCache(), now = Date.now(), k, keys = [];
      for (k in o) {
        if (Object.prototype.hasOwnProperty.call(o, k)) {
          if (!o[k] || !o[k].t || now - o[k].t > CACHE_TTL) delete o[k];
          else keys.push(k);
        }
      }
      keys.sort(function (a, b) { return (o[a].t || 0) - (o[b].t || 0); });
      while (keys.length >= CACHE_MAX) { delete o[keys.shift()]; }
      o[key] = { t: now, body: body };
      localStorage.setItem(LS_CACHE, JSON.stringify(o));
    } catch (e) {}
  }

  function getCache(key) {
    try {
      var o = readCache(), c = o[key];
      if (c && c.body && Date.now() - c.t <= CACHE_TTL) return c.body;
    } catch (e) {}
    return null;
  }

  function staleResponse(body) {
    try {
      return new Response(body, {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'X-FKD-Cache': 'stale' }
      });
    } catch (e) {
      return null;
    }
  }

  function notifyDegraded(url, reason) {
    try {
      window.dispatchEvent(new CustomEvent('fkd:net-degraded', {
        detail: { url: url, reason: reason, active: currentEp() }
      }));
    } catch (e) {}
    if (typeof onDegraded === 'function') {
      try { onDegraded({ url: url, reason: reason }); } catch (e) {}
    }
  }

  // --------------------------- 超时组合 ---------------------------
  // 兼容调用方自带 AbortController（子模块已有 12s 超时、图床上传有 signal）：
  // 不覆盖其语义，用「任一触发即 abort」的手工组合，避免 AbortSignal.any 的兼容问题。
  function withTimeout(init, isRequest, ms) {
    var ctrl = new AbortController();
    var timer = setTimeout(function () { ctrl.abort(); }, ms);
    var ext = (!isRequest && init && init.signal) || (isRequest && init && init.signal);
    if (ext) {
      if (ext.aborted) ctrl.abort();
      else {
        try { ext.addEventListener('abort', function () { ctrl.abort(); }, { once: true }); }
        catch (e) { /* 老浏览器 signal 无 addEventListener */ }
      }
    }
    return {
      signal: ctrl.signal,
      cleanup: function () { clearTimeout(timer); }
    };
  }

  // --------------------------- 统计 ---------------------------
  function record(ep, ms, ok, status, method, url) {
    try {
      statsBuf.push({ t: Date.now(), ep: ep, ms: ms, ok: !!ok, status: status || 0, method: method, url: url });
      if (statsBuf.length > 200) statsBuf.shift();
    } catch (e) {}
  }

  // --------------------------- 自动诊断 ---------------------------
  function onDiagPage() {
    return /(^|\/)diag\.html?($|[?#])/.test(location.pathname + location.search);
  }

  // 用户正在输入时不打断（否则刚写一半的投稿就没了）
  function userBusy() {
    try {
      var el = document.activeElement;
      if (!el) return false;
      var tag = (el.tagName || '').toUpperCase();
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
      if (el.isContentEditable) return true;
    } catch (e) {}
    return false;
  }

  function canJumpDiag() {
    if (onDiagPage()) return false;
    if (userBusy()) return false;
    // 只处理首屏打不开的情况；页面已经正常用起来之后的零散失败，只走缓存降级不跳转
    if (Date.now() - bootAt > DIAG_WINDOW_MS) return false;
    try {
      var last = parseInt(localStorage.getItem('fkd_diag_last') || '0', 10) || 0;
      if (Date.now() - last < DIAG_COOL_MS) return false;
    } catch (e) {}
    return true;
  }

  // 只有「网络层彻底失败」才计入（HTTP 4xx/5xx 说明链路是通的，不该跳）
  function noteNetFailure() {
    netFailStreak++;
    if (netFailStreak < DIAG_THRESHOLD) return;
    netFailStreak = 0;
    if (!canJumpDiag()) return;
    try { localStorage.setItem('fkd_diag_last', String(Date.now())); } catch (e) {}
    try {
      var u = DIAG_URL + '?auto=1&from=' + encodeURIComponent(location.pathname);
      location.href = u;
    } catch (e) {}
  }

  function noteNetSuccess() { netFailStreak = 0; }

  // --------------------------- 请求主体 ---------------------------
  function attempt(input, init, ctx, tried) {
    var ep = currentEp();
    var target = rewrite(ctx.url, ep);
    var t = withTimeout(init, ctx.isRequest, ctx.method === 'GET' ? TIMEOUT_GET : TIMEOUT_WRITE);
    var t0 = Date.now();
    var reqInit = init;

    var call;
    try {
      if (ctx.isRequest) {
        // input 是 Request 对象：构造新 Request 继承 method/headers/body，signal 走 init 覆盖
        var req = new Request(target, input);
        call = _raw(req, { signal: t.signal });
      } else {
        var merged = {};
        if (init) { for (var k in init) { if (Object.prototype.hasOwnProperty.call(init, k)) merged[k] = init[k]; } }
        merged.signal = t.signal;
        reqInit = merged;
        call = _raw(target, merged);
      }
    } catch (e) {
      t.cleanup();
      return Promise.reject(e);
    }

    return call.then(function (res) {
      t.cleanup();
      record(ep, Date.now() - t0, res.ok, res.status, ctx.method, ctx.url);

      if (res.status >= 500) markFail(ep); else markOk(ep);
      // 拿到任何 HTTP 响应都说明链路是通的（哪怕 4xx/5xx），不触发诊断
      noteNetSuccess();

      // 5xx 视作端点故障：幂等 GET 换端点重试一次
      if (res.status >= 500 && ctx.idempotent && endpoints.length > 1 && tried < 1) {
        if (switchEndpoint()) return attempt(input, init, ctx, tried + 1);
      }

      // 成功写缓存（只收 /rest/v1/ 的 JSON 响应，绝不把图片二进制塞进 localStorage）
      if (res.ok && ctx.cacheKey) {
        try {
          var ct = res.headers && res.headers.get ? (res.headers.get('Content-Type') || '') : '';
          if (ct.indexOf('json') !== -1 || ct === '') {
            var clone = res.clone();
            clone.text().then(function (txt) {
              if (txt && txt.length < 200000) putCache(ctx.cacheKey, txt);
            }).catch(function () {});
          }
        } catch (e) {}
      }
      return res;
    }).catch(function (err) {
      t.cleanup();
      record(ep, Date.now() - t0, false, 0, ctx.method, ctx.url);
      markFail(ep);

      // 网络层失败：幂等 GET 换端点重试一次（POST/PATCH/DELETE 一律不重试）
      var callerAborted = init && init.signal && init.signal.aborted;
      if (ctx.idempotent && endpoints.length > 1 && tried < 1 && !callerAborted) {
        if (switchEndpoint()) return attempt(input, init, ctx, tried + 1);
      }

      // 全端点失败：返回缓存（stale-while-error），避免白屏
      if (ctx.idempotent && ctx.cacheKey) {
        var cached = getCache(ctx.cacheKey);
        if (cached) {
          var stale = staleResponse(cached);
          if (stale) {
            notifyDegraded(ctx.url, 'network');
            return stale;
          }
        }
      }

      // 连缓存都没有，说明是真断网：计入自动诊断（仅在「可跳转 + 用户没在输入 + 冷却期外」时生效）
      if (!callerAborted) noteNetFailure();
      throw err;
    });
  }

  // --------------------------- fetch 包装 ---------------------------
  window.fetch = function (input, init) {
    var isRequest = (typeof input !== 'string') && !!(input && input.url);
    var url = isRequest ? input.url : (typeof input === 'string' ? input : '');

    if (!isOurRequest(url)) return _raw(input, init);   // 非本项目请求：原样透传

    var method = 'GET';
    try {
      if (init && init.method) method = String(init.method).toUpperCase();
      else if (isRequest && input.method) method = String(input.method).toUpperCase();
    } catch (e) {}

    var hasBody = false;
    try {
      hasBody = (!!(init && init.body != null)) || (isRequest && !!(input.body != null));
    } catch (e) {}

    // 严格幂等判定：GET/HEAD/OPTIONS 且无 body
    var idempotent = (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') && !hasBody;
    var cacheKey = null;
    if (idempotent && url.indexOf('/rest/v1/') !== -1 && cacheable(init, isRequest)) {
      cacheKey = urlKey(url);
    }

    var ctx = {
      url: url, method: method, idempotent: idempotent,
      cacheKey: cacheKey, isRequest: isRequest
    };
    return attempt(input, init, ctx, 0);
  };

  // --------------------------- 启动竞速 ---------------------------
  // 只有配置了 >1 个端点才执行；并发探测，谁先 200 用谁，避免每次都先撞主端点超时。
  // 用 _raw 直连，避免递归包装；探测请求带 apikey（匿名读），不带用户 token。
  function probe() {
    if (endpoints.length < 2) return;
    var winner = false;
    endpoints.forEach(function (ep) {
      var ctrl = new AbortController();
      var to = setTimeout(function () { ctrl.abort(); }, PROBE_TIMEOUT);
      var t0 = Date.now();
      try {
        _raw(ep + '/rest/v1/users?select=id&limit=1', {
          method: 'GET',
          headers: { 'apikey': ANON },
          signal: ctrl.signal
        }).then(function (r) {
          clearTimeout(to);
          record(ep, Date.now() - t0, r.ok, r.status, 'PROBE', 'probe');
          if (r.ok && !winner) { winner = true; markOk(ep); saveActive(ep); }
          else if (!r.ok) markFail(ep);
        }).catch(function () {
          clearTimeout(to);
          markFail(ep);
          record(ep, Date.now() - t0, false, 0, 'PROBE', 'probe');
        });
      } catch (e) { clearTimeout(to); }
    });
    probeDone = true;
  }

  // --------------------------- 对外接口 ---------------------------
  window.FKD_NET = {
    version: '1.0',
    endpoints: function () { return endpoints.slice(); },
    active: function () { return currentEp(); },
    stats: function () { return statsBuf.slice(); },
    clearStats: function () { statsBuf = []; },
    clearCache: function () { try { localStorage.removeItem(LS_CACHE); } catch (e) {} },
    probe: probe,
    setEndpoints: function (list) {
      try { localStorage.setItem(LS_ENDPOINTS, JSON.stringify(list)); } catch (e) {}
      endpoints = readEndpoints();
      activeEp = readActive();
      probeDone = false;
      probe();
      return endpoints.slice();
    },
    setDegradedHandler: function (fn) { onDegraded = fn; },
    goDiag: function () {
      try { location.href = DIAG_URL + '?auto=1'; } catch (e) {}
    },
    _primary: PRIMARY
  };

  // 延迟到 load 之后再探测，不抢占首屏关键请求
  if (document.readyState === 'complete') setTimeout(probe, 0);
  else window.addEventListener('load', function () { setTimeout(probe, 300); });
})();
