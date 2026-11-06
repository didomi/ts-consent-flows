import { readFlowType, flowTypeURL } from "./flows-mode.mjs";

const select = document.querySelector("#flow-type");
select.addEventListener("change", () => {
  // A document navigation discards the previous SDK and its globals/listeners.
  location.assign(flowTypeURL(select.value, location.href));
});

try {
  const type = readFlowType(new URLSearchParams(location.search));
  select.value = type;
  if (type === "consent") await import("./flows.js");
  else {
    const { startDSRFoundation } = await import("./flows-dsr.mjs");
    startDSRFoundation();
  }
} catch (error) {
  const requested = new URLSearchParams(location.search).get("flow_type");
  if (requested && !["consent", "dsr"].includes(requested)) {
    const option = document.createElement("option");
    option.value = requested;
    option.textContent = `Unsupported: ${requested}`;
    select.append(option);
    select.value = requested;
  }
  const status = document.querySelector("#status");
  status.textContent = error.message;
  status.dataset.error = "true";
  // Preserve the early CMP troubleshooting fallback if its module fails to load.
  window.flowDebugCapture?.record("Sandbox startup", "error", error.message);
}
