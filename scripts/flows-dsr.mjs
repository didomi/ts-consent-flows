import { createWorkspace } from "./flows-layout.mjs";
import { createJSONViewer } from "./flows-json-viewer.mjs";
import { createDSRView } from "./flows-dsr-view.mjs";
import { dsrFrameDocument } from "./flows-dsr-frame.mjs";
import {
  dsrFields,
  readDSRState,
  validateDSR,
  dsrLoaderURL,
  dsrShareURL,
  dsrFindings,
} from "./flows-dsr-state.mjs";

export function startDSR() {
  const initial = readDSRState(new URLSearchParams(location.search));
  const root = createDSRView();
  const viewer = createJSONViewer(root);
  viewer.error("No DSR configuration has been requested.");
  const workspace = createWorkspace(initial);
  const controls = new Map();
  const status = document.querySelector("#status");
  const findings = document.querySelector("#dsr-findings");
  const messages = new Set();
  let config;
  let port;
  let ready = false;
  let visible = false;
  let loadTimer;
  let showTimer;
  const say = (text, error = false, navigate = false) => {
    status.textContent = text;
    status.dataset.error = String(error);
    if (error && navigate) {
      workspace.activate("troubleshoot", true);
      document.querySelector("#tab-troubleshoot").focus();
    }
  };
  function addFinding(text) {
    messages.add(text);
    findings.replaceChildren();
    for (const message of messages) {
      const item = document.createElement("li");
      item.textContent = message;
      findings.append(item);
    }
  }
  for (const field of dsrFields) {
    const label = document.createElement("label");
    label.textContent = field.label;
    const input = document.createElement(field.options ? "select" : "input");
    input.id = `dsr-${field.key}`;
    input.name = field.key;
    if (field.options) {
      for (const value of new Set([...field.options, initial[field.key]])) {
        const option = document.createElement("option");
        option.value = option.textContent = value;
        input.append(option);
      }
    } else {
      input.type = "text";
      input.autocomplete = "off";
      input.spellcheck = false;
    }
    input.value = initial[field.key];
    if (["apiKey", "flow_id"].includes(field.key)) input.required = true;
    label.htmlFor = input.id;
    label.append(input);
    document.querySelector("#dsr-fields").append(label);
    controls.set(field.key, input);
  }
  const state = () =>
    Object.fromEntries(
      [...controls].map(([key, input]) => [key, input.value.trim()]),
    );
  function preview(updateHistory = false) {
    const current = state();
    const share = dsrShareURL(current, location.href);
    document.querySelector("#share-url").value = share.href;
    if (updateHistory) history.replaceState(null, "", share);
    try {
      validateDSR(current, false);
      if (!current.apiKey || !current.flow_id) {
        document.querySelector("#loader-url").textContent =
          "Enter both a public API key and a Flow ID.";
        return false;
      }
      document.querySelector("#loader-url").textContent =
        dsrLoaderURL(current).href;
      return true;
    } catch (error) {
      say(error.message, true);
      return false;
    }
  }
  for (const input of controls.values())
    input.addEventListener("input", () => {
      if (preview(true))
        say("Settings changed. Apply and reload to load this DSR Flow.");
    });
  document.querySelector("#dsr-form").addEventListener("submit", (event) => {
    event.preventDefault();
    if (!preview()) return;
    const url = dsrShareURL(state(), location.href);
    url.hash = "test";
    history.replaceState({ flowsApplyReload: true }, "", url);
    location.reload();
  });
  document.querySelector("#copy-link").addEventListener("click", async () => {
    preview();
    const input = document.querySelector("#share-url");
    try {
      await navigator.clipboard.writeText(input.value);
      say("Share link copied.");
    } catch {
      input.closest("details").open = true;
      input.focus();
      input.select();
      say("Copy the selected share link.");
    }
  });
  document.querySelector("#copy-config").addEventListener("click", async () => {
    if (!config) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(config, null, 2));
      say("DSR configuration copied.");
    } catch {
      viewer.showPlain();
      say("Select and copy the configuration JSON.");
    }
  });
  document
    .querySelector("#inspect-config")
    .addEventListener("click", () => port?.postMessage({ type: "inspect" }));
  document.querySelector("#hide-widget").addEventListener("click", () => {
    clearTimeout(showTimer);
    port?.postMessage({ type: "hide" });
  });
  document.querySelector("#show-widget").addEventListener("click", () => {
    if (!ready) return;
    port.postMessage({
      type: "show",
      widgetId: document.querySelector("#dsr-widget").value.trim(),
      layerName: document.querySelector("#dsr-layer").value.trim(),
    });
    if (!visible) {
      clearTimeout(showTimer);
      showTimer = setTimeout(() => {
        if (!visible) {
          const text =
            "No widget became visible. Check the widget/layer selection, routing and published assets.";
          addFinding(text);
          say(text, true, true);
        }
      }, 10000);
    }
  });
  window.addEventListener("popstate", () => location.reload());
  window.addEventListener("pagehide", () => {
    clearTimeout(loadTimer);
    clearTimeout(showTimer);
    port?.close();
  });
  say("Enter both a public API key and a Flow ID to load a DSR preview.");
  if (!preview()) return;
  say("Loading the DSR SDK in the submission-blocked preview…");
  const applied = state();
  const frame = document.createElement("iframe");
  frame.id = "dsr-preview";
  frame.title = "DSR request form preview — submission blocked";
  frame.setAttribute("sandbox", "allow-scripts");
  frame.srcdoc = dsrFrameDocument(new URL("./dsr-preview.js", import.meta.url));
  const fail = (text) => {
    clearTimeout(loadTimer);
    addFinding(text);
    say(text, true, true);
  };
  frame.addEventListener("load", () => {
    if (port) {
      fail("The preview frame navigated away. Apply and reload to restart it.");
      frame.remove();
      return;
    }
    const channel = new MessageChannel();
    port = channel.port1;
    port.onmessage = ({ data }) => {
      if (data.type === "config") {
        config = data.config;
        viewer.update(config);
        document.querySelector("#copy-config").disabled = !config;
        document.querySelector("#loaded-config-status").textContent =
          "Read from DidomiDSR.getConfig().";
        messages.clear();
        const issues = dsrFindings(config);
        addFinding(
          issues.length
            ? issues[0]
            : "No configuration issues found by these checks. SDK readiness does not prove the widget has mounted.",
        );
        for (const issue of issues.slice(1)) addFinding(issue);
        if (issues.length)
          say(
            "DSR configuration needs attention. Review Troubleshoot.",
            true,
            true,
          );
      } else if (data.type === "ready") {
        ready = true;
        clearTimeout(loadTimer);
        for (const id of ["show-widget", "hide-widget", "inspect-config"])
          document.getElementById(id).disabled = false;
        if (!dsrFindings(config).length)
          say(
            "DSR SDK ready. Request submission remains blocked in this preview.",
          );
      } else if (data.type === "visibility") {
        visible = data.visible === true;
        if (visible) clearTimeout(showTimer);
        document.querySelector("#dsr-visibility").textContent = visible
          ? "Widget visible in preview."
          : "Widget not visible. Use Show widget to test its routing.";
      } else if (data.type === "submission-blocked") {
        document.querySelector("#dsr-submission-status").textContent =
          "Submission blocked by the preview. No subject request was sent.";
      } else if (data.type === "connection-blocked") {
        addFinding(
          "An outbound connection was blocked by preview isolation. Remote assets using fetch/XHR cannot load in this mode.",
        );
      } else if (data.type === "error") fail(data.message);
    };
    frame.contentWindow.postMessage(
      { type: "dsr-preview:init", loaderURL: dsrLoaderURL(applied).href },
      "*",
      [channel.port2],
    );
  });
  loadTimer = setTimeout(
    () =>
      fail(
        "The isolated DSR preview did not become ready. Check network access, SDK availability and browser extensions.",
      ),
    25000,
  );
  document.querySelector("#dsr-preview-container").append(frame);
}
