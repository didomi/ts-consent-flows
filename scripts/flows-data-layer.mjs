export const consentSignals = {
  ad_storage: "ad",
  analytics_storage: "analytics",
  functionality_storage: "functionality",
  personalization_storage: "personalization",
  security_storage: "security",
  ad_user_data: "ad_user_data",
  ad_personalization: "ad_personalization",
};
const advertising = new Set([
  "ad_storage",
  "ad_user_data",
  "ad_personalization",
]);
export function describeGCM(config, gpc) {
  const gcm = config?.integrations?.vendors?.gcm;
  const enabled = gcm?.enable === true;
  const layer =
    typeof gcm?.dataLayerName === "string" && gcm.dataLayerName
      ? gcm.dataLayerName
      : "dataLayer";
  const notes = [];
  if (!enabled)
    notes.push(
      "GCM is not enabled in the effective config. Events may still come from other page scripts; their presence does not enable the SDK integration.",
    );
  else {
    if (gpc)
      notes.push(
        "Browser GPC is enabled. SDK handling can prioritize opt-out defaults (denied except security). Check the observed commands for this build.",
      );
    if (gcm.setDefaultStatus)
      notes.push(
        "The effective config requests default statuses on a fresh visit. Stored choices can instead produce an update at startup.",
      );
    else
      notes.push(
        "Default status is not requested in the effective config. A fresh opt-in visit can legitimately emit no default; when consent is not required, this SDK may supply granted defaults.",
      );
    if (config?.regulation?.group?.name === "mixed")
      notes.push(
        "Mixed-group regulations normally receive generated granted defaults. These are starting values, not proof of an explicit agreement; GPC and saved choices can change runtime behavior.",
      );
    if (gcm.enableTCFAdvertiserConsentMode === true)
      notes.push(
        "TCF manages advertising consent. Direct SDK updates may omit ad_storage, ad_user_data and ad_personalization; omission is not an error.",
      );
  }
  if (enabled)
    notes.push(
      "The SDK keeps security_storage granted. Configured defaults alone do not establish runtime consent.",
    );
  notes.push(
    "Observed commands are evidence from this page only. They do not prove that Google tags loaded, received the commands, or sent requests. Config includes local overrides; Console drafts are not inspected.",
  );
  return { enabled, layer, gcm, notes };
}
export function commandOf(entry) {
  const value = entry.value;
  return Array.isArray(value) &&
    value[0] === "consent" &&
    ["default", "update"].includes(value[1]) &&
    value[2] &&
    typeof value[2] === "object"
    ? { kind: value[1], signals: value[2] }
    : null;
}
export function signalRows(config, entries) {
  const { gcm, layer } = describeGCM(config, false);
  const latest = {};
  for (const entry of entries) {
    const command = commandOf(entry);
    if (entry.layers.includes(layer) && command)
      latest[command.kind] = command.signals;
  }
  return Object.entries(consentSignals).map(([signal, key]) => ({
    signal,
    configured:
      typeof gcm?.defaultStatus?.[key] === "boolean"
        ? gcm.defaultStatus[key]
          ? "granted"
          : "denied"
        : "Unspecified",
    default: latest.default?.[signal] ?? "Not observed",
    update:
      latest.update?.[signal] ??
      (gcm?.enableTCFAdvertiserConsentMode === true && advertising.has(signal)
        ? "Not observed (TCF-managed)"
        : "Not observed"),
  }));
}
export function createDataLayerPanel(root) {
  const capture = window.flowDataLayerCapture;
  const history = root.querySelector("#data-layer-history");
  const feedback = root.querySelector("#data-layer-feedback");
  const filter = root.querySelector("#data-layer-filter");
  let config;
  let context = {};
  let seenRevision = -1;
  let filtered = [];
  let report;
  function render() {
    seenRevision = capture?.revision;
    const description = describeGCM(
      config,
      navigator.globalPrivacyControl === true,
    );
    const entries = capture?.entries || [];
    const layers = capture?.layers || [];
    root.querySelector("#data-layer-status").textContent = capture
      ? `${entries.length} retained entries · ${capture.dropped} older entries discarded. Observing ${layers.map((l) => `${l.name}: ${l.status}`).join("; ")}.`
      : "Startup data layer capture is unavailable. Reload the page to retry.";
    const settings = {
      GCM: description.enabled
        ? "Enabled"
        : config
          ? "Not enabled"
          : "Config not loaded",
      regulation: config?.regulation?.name ?? "Not returned",
      regulationGroup: config?.regulation?.group?.name ?? "Not returned",
      browserGPC: navigator.globalPrivacyControl === true,
      GCMDataLayer: description.layer,
      tagManager: config?.tagManager ?? null,
      effectiveGCMConfig: description.gcm ?? null,
      SDK: context,
    };
    root.querySelector("#data-layer-settings").textContent = JSON.stringify(
      capture?.snapshot(settings) ?? settings,
      null,
      2,
    );
    const notes = root.querySelector("#data-layer-notes");
    notes.replaceChildren();
    for (const note of description.notes) {
      const item = document.createElement("li");
      item.textContent = note;
      notes.append(item);
    }
    const body = root.querySelector("#data-layer-signals");
    body.replaceChildren();
    for (const row of signalRows(config, entries)) {
      const tr = document.createElement("tr");
      for (const key of ["signal", "configured", "default", "update"]) {
        const cell = document.createElement(key === "signal" ? "th" : "td");
        if (key === "signal") cell.scope = "row";
        cell.textContent =
          typeof row[key] === "string" ? row[key] : JSON.stringify(row[key]);
        tr.append(cell);
      }
      body.append(tr);
    }
    const query = filter.value.trim().toLowerCase();
    filtered = entries.filter((entry) => {
      const command = commandOf(entry);
      const searchable = `${command ? `consent ${command.kind} ` : ""}${JSON.stringify(entry)}`;
      return !query || searchable.toLowerCase().includes(query);
    });
    const expanded = new Set(
      [...history.querySelectorAll("details[open]")].map(
        (item) => item.dataset.entryId,
      ),
    );
    history.replaceChildren();
    for (const entry of [...filtered].reverse()) {
      const item = document.createElement("li");
      const details = document.createElement("details");
      details.dataset.entryId = String(entry.id);
      details.open = expanded.has(String(entry.id));
      const summary = document.createElement("summary");
      const command = commandOf(entry);
      const event = command
        ? `consent ${command.kind}`
        : typeof entry.value?.event === "string"
          ? entry.value.event
          : "Data layer entry";
      summary.textContent = `${entry.observedAt} · ${entry.layers.join(", ")} · ${event} · ${entry.source}`;
      const json = document.createElement("pre");
      json.textContent = JSON.stringify(entry.value, null, 2);
      details.append(summary, json);
      item.append(details);
      history.append(item);
    }
    if (!filtered.length) {
      const item = document.createElement("li");
      item.textContent = query
        ? "No entries match this filter."
        : "No entries captured. A layer may not exist or the integration may not emit commands for these settings.";
      history.append(item);
    }
    root.querySelector("#data-layer-count").textContent =
      `${filtered.length} matching entries. Signal table uses all retained entries for the GCM layer, regardless of filter.`;
    report = {
      settings: capture?.snapshot(settings) ?? settings,
      layers,
      dropped: capture?.dropped ?? 0,
      filter: filter.value,
      entries: filtered,
    };
  }
  root.querySelector("#refresh-data-layer").addEventListener("click", () => {
    try {
      config = window.Didomi?.getConfig?.();
      capture?.configure(config);
      render();
      feedback.textContent =
        "Refreshed captured entries and effective configuration.";
    } catch {
      feedback.textContent =
        "Could not read the SDK configuration. Captured entries remain available.";
    }
  });
  root.querySelector("#clear-data-layer").addEventListener("click", () => {
    capture?.clear();
    render();
    feedback.textContent =
      "Cleared the diagnostic view. The real data layers and consent choices are unchanged.";
  });
  filter.addEventListener("input", render);
  root.querySelector("#copy-data-layer").addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(report, null, 2));
      feedback.textContent =
        "Copied configuration context and filtered entries. Data layer entries can contain visitor information.";
    } catch {
      feedback.textContent =
        "Clipboard unavailable. Expand entries to select and copy their JSON.";
    }
  });
  setInterval(() => {
    if (seenRevision !== capture?.revision) render();
  }, 250);
  render();
  return {
    update(nextConfig, nextContext) {
      config = nextConfig;
      context = nextContext;
      capture?.configure(config);
      render();
    },
  };
}
