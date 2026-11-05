import {
  captureConsentData,
  consentRows,
  describeConsentCollection,
  consentInterpretation,
  consentMetadata,
} from "./flows-consent-state.mjs";

export function createConsentStatePanel(root, refreshSnapshot) {
  const feedback = root.querySelector("#consent-state-status");
  const refresh = root.querySelector("#refresh-consent-state");
  const copy = root.querySelector("#copy-consent-state");
  const raw = root.querySelector("#consent-state-raw");
  const projection = root.querySelector("#consent-projection-raw");
  const filter = root.querySelector("#consent-state-filter");
  const summary = root.querySelector("#consent-state-summary");
  let report;
  const collections = ["purposes", "vendors"].map((kind) => ({
    kind,
    rows: [],
    limit: 100,
    body: root.querySelector(`#consent-state-${kind}`),
    status: root.querySelector(`#consent-state-${kind}-status`),
    more: root.querySelector(`#more-consent-${kind}`),
  }));
  function renderRows(collection) {
    const query = filter.value.trim().toLowerCase();
    const rows = collection.rows.filter((row) =>
      [row.id, row.name, row.namespace, row.state].some((text) =>
        text.toLowerCase().includes(query),
      ),
    );
    const visible = rows.slice(0, collection.limit);
    collection.body.replaceChildren();
    for (const row of visible) {
      const tr = document.createElement("tr");
      for (const key of ["id", "name", "namespace", "state", "detail"]) {
        const cell = document.createElement("td");
        const value = row[key] ?? "Not returned";
        cell.textContent =
          value.length > 500
            ? value.slice(0, 500) + "… (see raw snapshot)"
            : value;
        tr.append(cell);
      }
      collection.body.append(tr);
    }
    collection.status.textContent = `${collection.description || "No snapshot read yet."} Showing ${visible.length} of ${rows.length} matching entries.`;
    collection.more.hidden = visible.length === rows.length;
  }
  function clear(message) {
    report = undefined;
    raw.textContent = projection.textContent = "No current snapshot available.";
    summary.textContent = "";
    root.querySelector("#consent-state-interpretation").textContent = "";
    root.querySelector("#consent-projection-status").textContent = "Not read.";
    for (const collection of collections) {
      collection.rows = [];
      collection.description = "No current snapshot available.";
      renderRows(collection);
    }
    feedback.textContent = message;
    copy.disabled = true;
  }
  refresh.addEventListener("click", refreshSnapshot);
  filter.addEventListener("input", () => {
    for (const collection of collections) {
      collection.limit = 100;
      renderRows(collection);
    }
  });
  for (const collection of collections) {
    collection.more.addEventListener("click", () => {
      collection.limit += 100;
      renderRows(collection);
    });
  }
  copy.addEventListener("click", async () => {
    if (!report) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(report, null, 2));
      feedback.textContent =
        "Consent snapshot copied, including returned user identifiers and consent strings. Share it only where intended.";
    } catch {
      root.querySelector("#consent-state-raw-details").open = true;
      const range = document.createRange();
      range.selectNodeContents(raw);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      raw.focus();
      feedback.textContent =
        "Clipboard unavailable. The raw SDK snapshot is selected for manual copy; the tag-manager projection is separate below.";
    }
  });
  return {
    readState({ phase, message }) {
      refresh.disabled = phase === "reading" || phase === "unavailable";
      copy.disabled = true;
      if (phase === "error" || phase === "unavailable") clear(message);
      else
        feedback.textContent = report
          ? `Previous snapshot from ${report.capturedAt} is stale. ${message}`
          : message;
    },
    update(status, { config, shouldCollect, capturedAt }) {
      const captured = captureConsentData(status);
      const data = captured.value;
      const metadata = consentMetadata(data, window.Didomi, config);
      let tagManager;
      try {
        const descriptor = Object.getOwnPropertyDescriptor(
          window,
          "didomiState",
        );
        if (
          !descriptor ||
          ("value" in descriptor && descriptor.value === undefined)
        )
          tagManager = {
            available: false,
            reason:
              "window.didomiState is not present. A tag-manager integration may be disabled or may not have published it yet.",
          };
        else if (!("value" in descriptor))
          tagManager = {
            available: false,
            reason: "window.didomiState is an accessor and was not evaluated.",
          };
        else {
          const projectionData = captureConsentData(descriptor.value);
          tagManager = {
            available: true,
            capturedAt,
            value: projectionData.value,
            notes: projectionData.notes,
          };
        }
      } catch {
        tagManager = {
          available: false,
          reason: "window.didomiState could not be read.",
        };
      }
      report = {
        source: "Didomi.getCurrentUserStatus()",
        capturedAt,
        consentCollectionRequested:
          typeof shouldCollect === "boolean" ? shouldCollect : "Unavailable",
        sdkStatus: data,
        notes: captured.notes,
        tagManager,
      };
      feedback.textContent = `Snapshot read at ${capturedAt}. Refresh is available for a current reading. ${captured.notes.join(" ")}`;
      refresh.disabled = copy.disabled = false;
      raw.textContent = JSON.stringify(data, null, 2);
      summary.replaceChildren();
      for (const [label, value] of Object.entries({
        Regulation:
          typeof data?.regulation === "string"
            ? data.regulation
            : "Not returned",
        "Consent collection requested": report.consentCollectionRequested,
        Created:
          typeof data?.created === "string" ? data.created : "Not returned",
        Updated:
          typeof data?.updated === "string" ? data.updated : "Not returned",
      })) {
        const line = document.createElement("p");
        line.textContent = `${label}: ${value}`;
        summary.append(line);
      }
      root.querySelector("#consent-state-interpretation").textContent =
        consentInterpretation(data, shouldCollect);
      for (const collection of collections) {
        collection.rows = consentRows(
          data?.[collection.kind],
          metadata[collection.kind],
        );
        collection.description = describeConsentCollection(
          data?.[collection.kind],
          collection.rows,
          collection.kind === "purposes" ? "Purpose" : "Vendor",
        );
        collection.limit = 100;
        renderRows(collection);
      }
      root.querySelector("#consent-projection-status").textContent =
        tagManager.available
          ? `window.didomiState sampled at ${capturedAt}. This tag-manager projection can differ from the SDK snapshot and is not evidence of an explicit agreement. ${tagManager.notes.join(" ")}`
          : tagManager.reason;
      projection.textContent = tagManager.available
        ? JSON.stringify(tagManager.value, null, 2)
        : "Not available.";
    },
  };
}
