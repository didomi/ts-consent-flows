import test from "node:test";
import assert from "node:assert/strict";
import {
  readDSRState,
  validateDSR,
  dsrLoaderURL,
  dsrShareURL,
  dsrFindings,
} from "../scripts/flows-dsr-state.mjs";
const state = readDSRState(
  new URLSearchParams(
    "apiKey=00000000-0000-4000-8000-000000000000&flow_id=example-flow&environment=staging&sdk_environment=staging&country=US&region=CA&commit_hash=latest&gpp_stub=1&config=private",
  ),
);
test("DSR URLs use the DSR service and never forward consent overrides or identities", () => {
  const url = dsrLoaderURL(state);
  assert.equal(url.origin, "https://sdk.staging.privacy-center.org");
  assert.equal(
    url.pathname,
    "/dsr/00000000-0000-4000-8000-000000000000/loader.js",
  );
  assert.equal(
    url.search,
    "?target=example-flow&environment=staging&platform=web&country=US&region=CA",
  );
  const share = dsrShareURL(
    state,
    "https://example.com/sandbox/?organization_user_id=private&config=secret#test",
  );
  assert.equal(share.searchParams.get("flow_type"), "dsr");
  assert.equal(share.searchParams.has("config"), false);
  assert.equal(share.searchParams.has("organization_user_id"), false);
  for (const invalid of [
    { ...state, apiKey: "invalid" },
    { ...state, country: "USA" },
    { ...state, country: "", region: "CA" },
    { ...state, sdk_environment: "unknown" },
  ])
    assert.throws(() => validateDSR(invalid));
});
const config = {
  app: { apiKey: "test" },
  flowId: "flow",
  environmentId: "env",
  configId: "config",
  regulation: { regulationConfigId: "reg" },
  defaultWidgetId: "widget",
  rules: [],
  brandConfig: { brandConfigId: "brand" },
  widgets: {
    widget: {
      defaultLanguage: "en",
      artifacts: {
        web: {
          en: {
            modern: "https://example.com/widget.js",
            legacy: {
              url: "https://example.com/legacy.js",
              globalName: "widget",
            },
          },
        },
      },
    },
  },
};
test("default-only DSR routing and brand references pass without CMP requirements", () => {
  assert.deepEqual(dsrFindings(config), []);
  assert.deepEqual(dsrFindings({ ...config, rules: undefined }), []);
  assert.match(
    dsrFindings({ ...config, defaultWidgetId: null }).join(" "),
    /Neither display rules nor a default/,
  );
  assert.match(dsrFindings({ ...config, widgets: {} }).join(" "), /No widgets/);
  assert.match(
    dsrFindings({ internalError: true }).join(" "),
    /missing flowId/,
  );
  assert.match(
    dsrFindings({
      ...config,
      rules: [{ id: "rule", targetWidgetId: "absent" }],
    }).join(" "),
    /absent from the catalog/,
  );
});
