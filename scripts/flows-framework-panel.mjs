import { createFrameworkProbe } from "./flows-framework-probes.mjs";
import { captureConsentData } from "./flows-consent-state.mjs";

export function createFrameworkPanel(root) {
  const reports = {};
  let context;
  let snapshotCurrent = false;
  let poll;
  let polling = false;
  let paused = false;
  const output = root.querySelector("[data-framework-report]");
  const feedback = root.querySelector("[data-framework-feedback]");
  const copy = root.querySelector("[data-framework-copy]");
  const probes = {};
  const api = (kind) => window[kind === "tcf" ? "__tcfapi" : "__gpp"];
  function render() {
    for (const kind of ["tcf", "gpp"]) {
      const report = reports[kind];
      if (!report) continue;
      root.querySelector(`[data-framework-status="${kind}"]`).textContent =
        `Ping: ${report.ping.phase} · Events: ${report.events.phase}`;
      const raw = root.querySelector(`[data-framework-raw="${kind}"]`);
      raw.textContent = JSON.stringify(report, null, 2);
      const latest = [report.ping, report.events]
        .filter((item) => item.response)
        .sort((a, b) => a.observedAt.localeCompare(b.observedAt))
        .at(-1);
      const data =
        kind === "gpp" && latest?.command === "events"
          ? latest.response.pingData
          : kind === "tcf"
            ? { ...report.ping.response, ...report.events.response }
            : latest?.response;
      const fields =
        kind === "tcf"
          ? [
              "cmpStatus",
              "cmpLoaded",
              "gdprApplies",
              "eventStatus",
              "listenerId",
              "apiVersion",
              "tcfPolicyVersion",
              "cmpVersion",
            ]
          : [
              "cmpStatus",
              "cmpDisplayStatus",
              "signalStatus",
              "supportedAPIs",
              "sectionList",
              "applicableSections",
              "gppVersion",
              "cmpVersion",
            ];
      root.querySelector(`[data-framework-summary="${kind}"]`).textContent =
        data
          ? fields
              .filter((key) => Object.hasOwn(data, key))
              .map((key) => `${key}: ${JSON.stringify(data[key])}`)
              .join(" · ")
          : "No response fields available.";
      const actualString = kind === "tcf" ? data?.tcString : data?.gppString;
      const expected =
        context?.snapshot?.[kind === "tcf" ? "consent_string" : "gpp_string"];
      const flag =
        kind === "tcf"
          ? context?.config?.regulation?.framework_settings?.tcf_enabled
          : context?.config?.regulation?.framework_settings?.gpp_enabled;
      const disabled =
        flag === false ||
        (kind === "gpp"
          ? context?.config?.integrations?.gpp?.enabled === false
          : context?.config?.integrations?.iab?.disableTCFAPI === true);
      const messages = [
        disabled
          ? "Loaded config explicitly reports this framework/API disabled. This does not remove a page startup stub."
          : "Framework enablement is not established by function existence. Missing config flags are unknown.",
      ];
      if (!snapshotCurrent)
        messages.push(
          "SDK string comparison is unavailable or stale; refresh Consent strings for a current shared snapshot.",
        );
      else if (typeof actualString === "string" && typeof expected === "string")
        messages.push(
          actualString === expected
            ? "API string matches the shared SDK snapshot."
            : "API and SDK strings differ at these capture times. Encoding and callbacks can settle asynchronously; refresh both before investigating.",
        );
      else
        messages.push(
          "Both sources did not return a comparable string; this alone is not an error.",
        );
      messages.push(
        `Loaded regulation: ${context?.snapshot?.regulation || context?.config?.regulation?.name || "unknown"}. Browser GPC: ${navigator.globalPrivacyControl === true ? "enabled" : "not observed as enabled"}.`,
      );
      root.querySelector(`[data-framework-evidence="${kind}"]`).textContent =
        messages.join(" ");
    }
    copy.disabled = !Object.values(reports).some(
      (report) => report.history.length,
    );
  }
  for (const kind of ["tcf", "gpp"])
    probes[kind] = createFrameworkProbe(
      kind,
      () => api(kind),
      (report) => {
        reports[kind] = report;
        render();
      },
    );
  function stopPolling() {
    clearInterval(poll);
    polling = false;
  }
  function refresh() {
    paused = false;
    stopPolling();
    for (const probe of Object.values(probes)) probe.refresh();
    feedback.textContent =
      "Read-only probes started. Events remain observed until Clear view, refresh or page exit.";
    // Discover APIs installed after startup without repeatedly queuing listeners.
    let attempts = 0;
    polling = true;
    poll = setInterval(() => {
      for (const probe of Object.values(probes))
        if (probe.apiChanged()) probe.refresh();
      if (++attempts >= 40) stopPolling();
    }, 500);
  }
  root
    .querySelector("[data-framework-refresh]")
    .addEventListener("click", refresh);
  root.querySelector("[data-framework-clear]").addEventListener("click", () => {
    paused = true;
    stopPolling();
    for (const probe of Object.values(probes)) probe.clear();
    output.textContent = "";
    feedback.textContent =
      "View cleared and listener removal requested. Use Probe APIs to resume. Consent is unchanged.";
  });
  copy.addEventListener("click", async () => {
    const captured = captureConsentData({
      capturedAt: new Date().toISOString(),
      context,
      snapshotCurrent,
      browserGPC: navigator.globalPrivacyControl === true,
      reports,
    });
    const text = JSON.stringify(captured, null, 2);
    try {
      await navigator.clipboard.writeText(text);
      feedback.textContent =
        "Framework report copied. It includes returned identifiers and consent strings.";
    } catch {
      output.textContent = text;
      output.parentElement.open = true;
      output.tabIndex = 0;
      output.focus();
      const range = document.createRange();
      range.selectNodeContents(output);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      feedback.textContent = "Copy the selected report.";
    }
  });
  window.addEventListener("pagehide", () => {
    stopPolling();
    Object.values(probes).forEach((probe) => probe.dispose());
  });
  window.addEventListener("pageshow", (event) => {
    if (event.persisted && !paused) refresh();
  });
  return {
    start: refresh,
    setContext(snapshot, config, capturedAt) {
      context = captureConsentData({
        snapshot,
        config: {
          regulation: config?.regulation,
          integrations: {
            gpp: config?.integrations?.gpp,
            iab: config?.integrations?.iab,
          },
        },
        capturedAt,
      }).value;
      snapshotCurrent = true;
      render();
    },
    stale() {
      snapshotCurrent = false;
      render();
    },
    setReady() {
      if (!paused && !polling) refresh();
    },
  };
}
