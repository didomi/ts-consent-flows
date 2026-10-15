function writeSDK(loaderUrl) {
  (function () {
    function n(e) {
      if (!window.frames[e]) {
        if (document.body && document.body.firstChild) {
          var t = document.body;
          var r = document.createElement("iframe");
          r.style.display = "none";
          r.name = e;
          r.title = e;
          t.insertBefore(r, t.firstChild);
        } else {
          setTimeout(function () {
            n(e);
          }, 5);
        }
      }
    }
    function e(r, a, o, c, s) {
      function e(e, t, r, n) {
        if (typeof r !== "function") {
          return;
        }
        if (!window[a]) {
          window[a] = [];
        }
        var i = false;
        if (s) {
          i = s(e, n, r);
        }
        if (!i) {
          window[a].push({ command: e, version: t, callback: r, parameter: n });
        }
      }
      e.stub = true;
      e.stubVersion = 2;
      function t(n) {
        if (!window[r] || window[r].stub !== true) {
          return;
        }
        if (!n.data) {
          return;
        }
        var i = typeof n.data === "string";
        var e;
        try {
          e = i ? JSON.parse(n.data) : n.data;
        } catch (t) {
          return;
        }
        if (e[o]) {
          var a = e[o];
          window[r](
            a.command,
            a.version,
            function (e, t) {
              var r = {};
              r[c] = { returnValue: e, success: t, callId: a.callId };
              n.source.postMessage(i ? JSON.stringify(r) : r, "*");
            },
            a.parameter,
          );
        }
      }
      if (typeof window[r] !== "function") {
        window[r] = e;
        if (window.addEventListener) {
          window.addEventListener("message", t, false);
        } else {
          window.attachEvent("onmessage", t);
        }
      }
    }
    e("__tcfapi", "__tcfapiBuffer", "__tcfapiCall", "__tcfapiReturn");
    n("__tcfapiLocator");
    const url = new URL(loaderUrl);
    for (const rel of ["preconnect", "dns-prefetch"]) {
      const link = document.createElement("link");
      link.rel = rel;
      link.as = "script";
      link.href = url.origin + "/";
      document.head.append(link);
    }
    const preload = document.createElement("link");
    preload.rel = "preload";
    preload.as = "script";
    preload.href = url.href;
    const loader = document.createElement("script");
    loader.id = "spcloader";
    loader.type = "text/javascript";
    loader.async = true;
    loader.charset = "utf-8";
    loader.src = url.href;
    document.head.append(preload, loader);
  })();
}
