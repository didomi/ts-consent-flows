import { createWorkspace } from "./flows-layout.mjs";

// Deliberately no DSR SDK import: published forms may automatically display and
// submit real subject requests. Enable the runtime only once submission behavior
// is defined and tested. The foundation can be reviewed/deployed independently.
export function startDSRFoundation() {
  document.title = "Subject Request Flows · Didomi Sandbox";
  document.querySelector(".intro h1").textContent =
    "Test your Subject Request Flows";
  const intro = document.querySelectorAll(".intro p:not(#flow-type-help)");
  intro[0].textContent =
    "Subject Request Flows (DSR) let visitors submit privacy rights requests.";
  intro[1].remove();
  document.querySelector("#status").textContent =
    "DSR testing is not available yet. No SDK or request form is loaded.";
  const contents = {
    setup: [
      "Subject Request Flow setup",
      "DSR configuration and form testing are not enabled. Choose Consent Flows above to test a consent notice.",
    ],
    test: [
      "Subject Request Flow testing",
      "No DSR form is loaded. Published request forms can create real subject requests when submitted.",
    ],
    config: [
      "DSR configuration",
      "No DSR configuration has been requested. Consent configuration and consent-state tools do not apply to this mode.",
    ],
    troubleshoot: [
      "DSR troubleshooting",
      "No DSR load has been attempted. DSR loading and configuration diagnostics are not available yet.",
    ],
  };
  for (const [name, [title, description]] of Object.entries(contents)) {
    const section = document.createElement("section");
    const heading = document.createElement("h2");
    heading.id = name === "test" ? "runtime-title" : `dsr-${name}-title`;
    heading.tabIndex = -1;
    heading.textContent = title;
    section.setAttribute("aria-labelledby", heading.id);
    const text = document.createElement("p");
    text.textContent = description;
    section.append(heading, text);
    document.getElementById(`${name}-panel`).replaceChildren(section);
  }
  document.querySelector("#widget-problem").remove();
  document.querySelector("#stored-consent-banner").remove();
  document.querySelector("#hide-preview").remove();
  document.querySelector("#sandbox footer").textContent =
    "Subject Request Flows use a separate SDK. Consent strings, consent status, GCM and TCF/GPP tools belong to Consent Flows mode.";
  createWorkspace();
  window.addEventListener("popstate", () => location.reload());
}
