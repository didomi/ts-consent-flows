// Capture startup failures before the SDK and the page module execute.
// Records stay in this page's memory; they are not sent or added to share links.
(function () {
  const flowType = new URLSearchParams(location.search).get("flow_type");
  if (flowType && flowType !== "consent") return;
  if (window.flowDebugCapture) return;
  const entries = [];
  let dropped = 0;
  function startupFallback() {
    const root = document.querySelector("#troubleshooting");
    if (!root || root.dataset.initialized) return;
    const list = root.querySelector("#runtime-events");
    list.replaceChildren();
    for (const entry of entries) {
      const item = document.createElement("li");
      item.textContent = `${entry.level}: ${entry.message} ${entry.detail}`;
      list.append(item);
    }
    const params = new URLSearchParams(location.search);
    const flowId =
      params.get("flow_id") ||
      (params.get("target_type") === "flow" && params.get("target"));
    if (
      params.get("apiKey") &&
      flowId &&
      entries.some((entry) => entry.level === "error")
    ) {
      for (const tab of document.querySelectorAll('[role="tab"][data-panel]')) {
        const active = tab.dataset.panel === "troubleshoot";
        tab.setAttribute("aria-selected", String(active));
        tab.tabIndex = active ? 0 : -1;
        document.getElementById(`${tab.dataset.panel}-panel`).hidden = !active;
      }
      document.querySelector("#tab-troubleshoot")?.focus();
    }
    if (entries.length)
      root.querySelector("#troubleshooting-summary").textContent =
        "Startup warnings or errors were captured before the diagnostics view loaded. Review the evidence below; a site developer may need to inspect the page.";
  }
  function describe(value) {
    try {
      if (value instanceof Error) return value.stack || value.message;
      return typeof value === "string"
        ? value
        : (JSON.stringify(value) ?? String(value));
    } catch {
      return "[Unserializable value]";
    }
  }
  function record(kind, level, message, detail = "") {
    message = String(message).slice(0, 4000);
    detail = String(detail).slice(0, 8000);
    const existing = entries.find(
      (entry) =>
        entry.kind === kind &&
        entry.level === level &&
        entry.message === message &&
        entry.detail === detail,
    );
    if (existing) {
      existing.count++;
      existing.lastSeen = new Date().toISOString();
    } else {
      if (entries.length === 100) {
        entries.shift();
        dropped++;
      }
      entries.push({
        kind,
        level,
        message,
        detail,
        count: 1,
        lastSeen: new Date().toISOString(),
      });
    }
    window.dispatchEvent(
      new CustomEvent("flows-debug-update", { detail: { level } }),
    );
    startupFallback();
  }
  window.flowDebugCapture = {
    entries,
    record,
    get dropped() {
      return dropped;
    },
    clear() {
      entries.length = 0;
      dropped = 0;
      window.dispatchEvent(new Event("flows-debug-update"));
    },
  };
  for (const level of ["warn", "error"]) {
    const original = console[level];
    console[level] = function (...args) {
      try {
        const message = args.map(describe).join(" ");
        record(
          /didomi/i.test(message) ? "SDK console" : "Page console",
          level === "warn" ? "warning" : "error",
          message,
        );
      } finally {
        original.apply(console, args);
      }
    };
  }
  window.addEventListener(
    "error",
    (event) => {
      if (event.target && event.target !== window) {
        const target = event.target;
        record(
          "Resource load",
          "error",
          `Could not load ${target.tagName?.toLowerCase() || "resource"}.`,
          target.src || target.href || "Resource URL unavailable.",
        );
      } else {
        record(
          "Page exception",
          "error",
          event.message || "Script error.",
          [event.filename, event.lineno, event.colno, event.error?.stack]
            .filter(Boolean)
            .join(":"),
        );
      }
    },
    true,
  );
  window.addEventListener("unhandledrejection", (event) =>
    record("Unhandled promise", "error", describe(event.reason)),
  );
  window.addEventListener("securitypolicyviolation", (event) =>
    record(
      "Content security policy",
      "error",
      `Blocked by ${event.effectiveDirective}.`,
      event.blockedURI,
    ),
  );
  document.addEventListener("DOMContentLoaded", startupFallback);
})();
