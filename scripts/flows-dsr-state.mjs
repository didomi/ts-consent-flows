import { inspectWidgetAssets } from "./flows-widget-assets.mjs";

export const dsrFields = [
  { key: "apiKey", label: "Public API key" },
  { key: "flow_id", label: "Flow ID" },
  {
    key: "environment",
    label: "Flow publication",
    options: ["production", "staging"],
  },
  {
    key: "sdk_environment",
    label: "Didomi platform environment",
    options: ["production", "staging", "preprod"],
  },
  { key: "platform", label: "Platform", options: ["web"] },
  { key: "country", label: "Country" },
  { key: "region", label: "Region" },
  { key: "regulation", label: "Regulation" },
];
const hosts = {
  production: "https://sdk.privacy-center.org/",
  staging: "https://sdk.staging.privacy-center.org/",
  preprod: "https://sdk-preprod.privacy-center.org/",
};
const defaults = {
  environment: "production",
  sdk_environment: "production",
  platform: "web",
};
export function readDSRState(params) {
  return Object.fromEntries(
    dsrFields.map(({ key }) => [key, params.get(key) ?? defaults[key] ?? ""]),
  );
}
export function validateDSR(state, requireTarget = true) {
  if (requireTarget && (!state.apiKey || !state.flow_id))
    throw new Error("Enter both a public API key and a Flow ID.");
  if (
    state.apiKey &&
    !/^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i.test(
      state.apiKey,
    )
  )
    throw new Error("The public API key must be a UUID.");
  for (const { key, options } of dsrFields)
    if (options && !options.includes(state[key]))
      throw new Error(`Unsupported ${key}.`);
  if (state.country && !/^[a-z]{2}$/i.test(state.country))
    throw new Error("Country must contain two letters.");
  if (state.region && !state.country)
    throw new Error("Region requires Country.");
}
export function dsrLoaderURL(state) {
  validateDSR(state);
  const url = new URL(
    `dsr/${encodeURIComponent(state.apiKey)}/loader.js`,
    hosts[state.sdk_environment],
  );
  url.searchParams.set("target", state.flow_id);
  url.searchParams.set("environment", state.environment);
  url.searchParams.set("platform", "web");
  for (const key of ["country", "region", "regulation"])
    if (state[key]) url.searchParams.set(key, state[key]);
  return url;
}
export function dsrShareURL(state, href) {
  const url = new URL(href);
  url.search = "";
  url.searchParams.set("flow_type", "dsr");
  for (const { key } of dsrFields)
    if (state[key]) url.searchParams.set(key, state[key]);
  return url;
}
export function dsrFindings(config) {
  if (!config || typeof config !== "object" || Array.isArray(config))
    return [
      "No usable DSR configuration was returned. Check publication, environment and organization access.",
    ];
  const findings = [];
  for (const key of ["flowId", "environmentId", "configId"])
    if (!config[key])
      findings.push(
        `DSR configuration is missing ${key}. Check publication and environment.`,
      );
  if (!config.app?.apiKey)
    findings.push("DSR configuration has no app.apiKey.");
  if (!config.regulation?.regulationConfigId)
    findings.push(
      "No regulation configuration ID was returned. Check the Flow’s geographic targeting.",
    );
  const widgets =
    config.widgets &&
    typeof config.widgets === "object" &&
    !Array.isArray(config.widgets)
      ? config.widgets
      : {};
  if (!Object.keys(widgets).length)
    findings.push(
      "No widgets were returned. Check Flow publication and assigned widgets.",
    );
  const rules = Array.isArray(config.rules) ? config.rules : [];
  if (!rules.length && !config.defaultWidgetId)
    findings.push("Neither display rules nor a default widget were returned.");
  if (config.defaultWidgetId && !widgets[config.defaultWidgetId])
    findings.push(
      "The default widget is not included in the returned widget catalog.",
    );
  for (const [id, widget] of Object.entries(widgets))
    if (!inspectWidgetAssets(widget).loadable)
      findings.push(`Widget ${id} has no usable published web display assets.`);
  for (const rule of rules)
    if (rule.targetWidgetId && !widgets[rule.targetWidgetId])
      findings.push(
        `Rule ${rule.id || "(unnamed)"} targets a widget absent from the catalog.`,
      );
  return findings;
}
