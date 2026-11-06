// Runs only inside the opaque-origin, script-only sandbox. CSP blocks all
// fetch/XHR/beacon/WebSocket connections and native form submissions.
(() => {
  const nonce = document.currentScript.nonce;
  let port;
  let ready = false;
  let lastVisible;
  let timer;
  const send = (type, detail = {}) => port?.postMessage({ type, ...detail });
  const fail = (message) => send("error", { message });
  window.addEventListener("securitypolicyviolation", (event) => {
    if (event.effectiveDirective === "connect-src") {
      let submission = false;
      try {
        submission =
          new URL(event.blockedURI).pathname.replace(/\/$/, "") ===
          "/dsr/requests";
      } catch {
        /* No URL available. */
      }
      send(submission ? "submission-blocked" : "connection-blocked");
    } else if (event.effectiveDirective === "form-action")
      send("submission-blocked");
  });
  window.addEventListener(
    "error",
    (event) => {
      if (event.target?.tagName === "SCRIPT")
        fail(
          "A DSR SDK or widget script could not load. Check publishing, asset availability and browser blocking extensions.",
        );
      else if (event.target === window)
        fail(
          "The DSR runtime encountered an error. Inspect the preview frame’s browser Console for details.",
        );
    },
    true,
  );
  window.addEventListener("message", (event) => {
    if (
      port ||
      event.source !== parent ||
      event.data?.type !== "dsr-preview:init" ||
      !event.ports[0]
    )
      return;
    port = event.ports[0];
    let url;
    try {
      url = new URL(event.data.loaderURL);
      if (
        ![
          "https://sdk.privacy-center.org",
          "https://sdk.staging.privacy-center.org",
          "https://sdk-preprod.privacy-center.org",
        ].includes(url.origin) ||
        !/^\/dsr\/[a-f\d-]+\/loader\.js$/i.test(url.pathname)
      )
        throw new Error();
    } catch {
      fail("Invalid DSR loader URL.");
      return;
    }
    port.onmessage = async ({ data }) => {
      if (!ready) return;
      try {
        const sdk = window.DidomiDSR;
        if (data?.type === "show") {
          const options = {};
          if (typeof data.widgetId === "string" && data.widgetId)
            options.widgetId = data.widgetId;
          if (typeof data.layerName === "string" && data.layerName)
            options.layerName = data.layerName;
          // The public API does not return the asynchronous mount promise.
          sdk.widgets.show(Object.keys(options).length ? options : undefined);
        } else if (data?.type === "hide") sdk.widgets.hide();
        else if (data?.type === "inspect") snapshot();
      } catch {
        fail(
          "The DSR widget action failed. Check the widget and layer names and the preview frame’s Console.",
        );
      }
    };
    function snapshot() {
      try {
        send("config", {
          config: JSON.parse(JSON.stringify(window.DidomiDSR.getConfig())),
        });
      } catch {
        fail("The DSR configuration could not be read.");
      }
    }
    window.didomiConfig = { app: { nonce } };
    const started = Date.now();
    timer = setInterval(() => {
      const sdk = window.DidomiDSR;
      if (
        !ready &&
        typeof sdk?.getConfig === "function" &&
        typeof sdk?.widgets?.show === "function" &&
        typeof sdk?.widgets?.hide === "function" &&
        typeof sdk?.widgets?.isVisible === "function"
      ) {
        ready = true;
        snapshot();
        send("ready");
      }
      if (ready) {
        try {
          const visible = Boolean(sdk.widgets.isVisible());
          if (visible !== lastVisible) {
            lastVisible = visible;
            send("visibility", { visible });
          }
        } catch {
          /* Readiness and visibility are independent. */
        }
      } else if (Date.now() - started > 20000) {
        clearInterval(timer);
        fail(
          "The DSR SDK did not become ready. Check the API key, Flow publication, environment and organization access (403 restrictions may apply). Browser extensions may also block loading.",
        );
      }
    }, 150);
    const loader = document.createElement("script");
    loader.nonce = nonce;
    loader.src = url.href;
    loader.async = true;
    document.head.append(loader);
  });
  window.addEventListener("pagehide", () => {
    clearInterval(timer);
    port?.close();
  });
})();
