// Static presentation only. SDK/configuration values are inserted as text.
export function createDSRView() {
  document.title = "Subject Request Flows · Didomi Sandbox";
  document.querySelector(".intro h1").textContent =
    "Test your Subject Request Flows";
  const intro = document.querySelectorAll(".intro p:not(#flow-type-help)");
  intro[0].textContent =
    "Load a published DSR Flow, inspect its configuration and preview its request form without submitting a request.";
  intro[1].remove();
  document.querySelector("#setup-panel").innerHTML = `
    <form id="dsr-form">
      <h2>Subject Request Flow setup</h2>
      <p class="hint">Use a published Web Flow. Country and Region select delivery and widget-rule location. Leave them blank for detected location. Draft edits do not change Console.</p>
      <div id="dsr-fields" class="fields"></div>
      <p class="hint">This preview blocks request submission and other outbound connections. Use test data when exploring the form.</p>
      <div class="actions"><button class="primary" type="submit">Apply and reload</button><button id="copy-link" type="button">Copy share link</button></div>
    </form>`;
  document.querySelector("#test-panel").innerHTML = `
    <section class="runtime" aria-labelledby="runtime-title">
      <h2 id="runtime-title" tabindex="-1">DSR form preview</h2>
      <p id="dsr-submission-status" role="status">Preview only: request submission is blocked. No subject request can be submitted through this frame.</p>
      <div class="fields">
        <label for="dsr-widget">Widget ID<input id="dsr-widget" autocomplete="off" /><small>Optional. Leave blank for the Flow’s selected widget.</small></label>
        <label for="dsr-layer">Layer name<input id="dsr-layer" autocomplete="off" /><small>Optional. Enter a layer defined by the widget.</small></label>
      </div>
      <p class="hint">Widget and layer selections are temporary and are not included in share links.</p>
      <div class="actions"><button id="show-widget" disabled>Show widget</button><button id="hide-widget" disabled>Hide widget</button></div>
      <p id="dsr-visibility" role="status">SDK not loaded.</p>
      <div id="dsr-preview-container"></div>
    </section>`;
  const root = document.querySelector(
    'section[aria-labelledby="loaded-config-title"]',
  );
  root.querySelector("p").textContent =
    "Resolved configuration from DidomiDSR.getConfig(). This is configuration, not a submitted request or consent status. Copy includes all returned configuration fields.";
  root
    .querySelector("#loaded-config")
    .setAttribute("aria-label", "DidomiDSR.getConfig() JSON");
  document.querySelector("#effective-config").closest("details").remove();
  document.querySelector("#troubleshoot-panel").innerHTML = `
    <section aria-labelledby="dsr-troubleshoot-title">
      <h2 id="dsr-troubleshoot-title" tabindex="-1">DSR troubleshooting</h2>
      <p>Confirm the public API key, Flow ID, publication and platform environment match a published Web DSR Flow. Preproduction and production may restrict organization access (HTTP 403). Browser extensions can block SDK scripts.</p>
      <p class="hint">The preview blocks all outbound connections and native form submissions. Assets requiring fetch/XHR will also be blocked. It does not validate successful backend submission. Inspect the frame’s browser Network and Console for HTTP status and failure details.</p>
      <ul id="dsr-findings"><li>No DSR load has been attempted.</li></ul>
    </section>`;
  for (const id of ["widget-problem", "stored-consent-banner", "hide-preview"])
    document.getElementById(id).remove();
  document.querySelector("#sandbox footer").textContent =
    "Subject Request Flows for Web. Request submission is blocked in this preview. Consent strings, consent status, GCM and TCF/GPP tools are available in Consent Flows mode.";
  return root;
}
