import { test } from "node:test";
import assert from "node:assert/strict";
import { checkConfig, eventSuggestion } from "../scripts/flows-checks.mjs";
import { inspectWidgetAssets } from "../scripts/flows-widget-assets.mjs";
import { widgetDiagnostics } from "../scripts/flows-state.mjs";

const valid = () => ({
  app: { apiKey: "key" },
  regulation: { name: "gdpr" },
  widgets: {
    widget: {
      defaultLanguage: "en",
      artifacts: {
        web: {
          en: {
            modern: "https://example.com/widget.js",
            legacy: {
              url: "https://example.com/classic.js",
              globalName: "TestWidget",
            },
          },
        },
      },
    },
  },
  defaultWidgetId: "widget",
  rules: [{ id: "rule", targetWidgetId: "widget", scenarios: [] }],
});

test("valid published config does not invent missing-section errors for optional settings", () => {
  assert.deepEqual(checkConfig(valid(), { apiKey: "key" }), []);
  const findings = checkConfig({
    app: { apiKey: "key" },
    regulation: { name: "none" },
  });
  assert.deepEqual(
    findings.map((f) => f.id),
    ["regulation-none"],
  );
  assert.equal(checkConfig(undefined, { ready: false })[0].severity, "info");
  assert.equal(checkConfig(null, { ready: true })[0].severity, "error");
});

test("artifact diagnostics follow the SDK locale and widget fallback without deriving URLs", () => {
  const definition = valid().widgets.widget;
  definition.artifacts.web.fr = { modern: "https://example.com/fr.js" };
  const config = { ...valid(), widgets: { widget: definition } };
  const exact = inspectWidgetAssets(definition, {
    language: "fr",
    sdkBuild: "modern",
  });
  assert.equal(exact.language, "fr");
  assert.equal(exact.candidates[0].modernUrl, "https://example.com/fr.js");
  assert.equal(exact.loadable, true);
  assert.deepEqual(
    checkConfig(config, { language: "fr", sdkBuild: "modern" }),
    [],
  );
  assert.deepEqual(
    widgetDiagnostics(config, { language: "fr" }).missingBundleUrls,
    [],
  );
  const fallback = inspectWidgetAssets(definition, { language: "fr-CA" });
  assert.equal(fallback.language, "en");
  delete definition.defaultLanguage;
  assert.equal(
    inspectWidgetAssets(definition, { language: "de" }).loadable,
    false,
  );
  // Unknown runtime language inspects candidates, without assuming the first is active.
  const unknown = inspectWidgetAssets(definition);
  assert.equal(unknown.language, null);
  assert.equal(unknown.loadable, true);
  // An existing language entry with no modern URL does not fall back to another language.
  definition.defaultLanguage = "en";
  definition.artifacts.web.fr = {};
  assert.equal(
    inspectWidgetAssets(definition, { language: "fr" }).loadable,
    false,
  );
});

test("legacy SDK artifacts need their published URL and global name as well as modern metadata", () => {
  const definition = valid().widgets.widget;
  assert.equal(
    inspectWidgetAssets(definition, { language: "en", sdkBuild: "legacy" })
      .loadable,
    true,
  );
  for (const legacy of [
    undefined,
    {},
    { url: "https://example.com/classic.js" },
    { url: "javascript:bad", globalName: "Widget" },
  ]) {
    definition.artifacts.web.en.legacy = legacy;
    assert.equal(
      inspectWidgetAssets(definition, { language: "en", sdkBuild: "modern" })
        .loadable,
      true,
    );
    const result = inspectWidgetAssets(definition, {
      language: "en",
      sdkBuild: "legacy",
    });
    assert.equal(result.loadable, false);
    assert.equal(result.issues[0].code, "legacy");
  }
});

test("missing, unsafe and malformed web artifacts are not masked by old or native assets", () => {
  for (const artifacts of [
    null,
    {},
    { native: { url: "https://example.com/native.json" } },
    { web: [] },
    { web: {} },
    { web: { en: { modern: "javascript:bad" } } },
    { web: { en: { modern: "/relative.js" } } },
  ]) {
    const definition = {
      artifacts,
      defaultLanguage: "en",
      bundleUrl: "https://example.com/ignored.js",
    };
    const config = { ...valid(), widgets: { widget: definition } };
    assert.equal(
      inspectWidgetAssets(definition, { language: "en" }).loadable,
      false,
    );
    assert.deepEqual(
      widgetDiagnostics(config, { language: "en" }).missingBundleUrls,
      ["widget"],
    );
    assert.ok(
      checkConfig(config, { language: "en" }).some(
        (f) => f.severity === "error",
      ),
    );
  }
  for (const widgets of [null, [], "bad", 4])
    assert.deepEqual(widgetDiagnostics({ widgets }).widgetIds, []);
  const legacy = {
    ...valid(),
    widgets: { widget: { bundleUrl: "https://example.com/old.js" } },
  };
  assert.equal(
    checkConfig(legacy).find((f) => f.id === "widget-bundle-widget").severity,
    "info",
  );
});

test("published brand snapshots pass while reference-only overrides explain missing themes", () => {
  const config = {
    ...valid(),
    brand: {
      brandConfigId: "brand",
      versionId: "version",
      id: "brand",
      name: "Example",
      brand_config: {
        id: "version",
        css_tokens: {},
        component_props: {},
        breakpoints: {},
      },
    },
  };
  const original = JSON.stringify(config);
  assert.deepEqual(checkConfig(config), []);
  assert.equal(JSON.stringify(config), original);
  config.brand = { brandConfigId: "brand", versionId: "version" };
  const finding = checkConfig(config).find((f) => f.id === "brand-snapshot");
  assert.equal(finding.severity, "warning");
  assert.match(finding.suggestion, /override can replace the snapshot/);
});
test("incomplete published assets and broken assignments produce Console actions", () => {
  const config = valid();
  config.widgets.widget = { versionId: "version" };
  config.defaultWidgetId = "missing-default";
  config.rules[0].targetWidgetId = "missing-rule-widget";
  config.brand = { versionId: "brand-version" };
  const findings = checkConfig(config, { widget_id: "requested-missing" });
  for (const id of [
    "widget-bundle-widget",
    "default-widget",
    "rule-widget-0",
    "requested-widget",
    "brand-shape",
  ])
    assert.ok(
      findings.some((f) => f.id === id),
      id,
    );
  assert.match(
    findings.find((f) => f.id === "brand-shape").suggestion,
    /Brand Manager/,
  );
  assert.match(
    findings.find((f) => f.id === "widget-bundle-widget").suggestion,
    /Flows → Privacy Widgets/,
  );
  assert.match(
    findings.find((f) => f.id === "widget-bundle-widget").suggestion,
    /does not establish an editor mistake/,
  );
  assert.ok(findings.every((f) => f.evidence && f.suggestion));
});
test("bad response shapes are diagnosed without throwing and unsafe asset URLs are rejected", () => {
  for (const value of [null, [], "bad", 4, {}])
    assert.doesNotThrow(() => checkConfig(value));
  for (const widgets of [
    null,
    [],
    "bad",
    { bad: null },
    { bad: { bundleUrl: "javascript:alert(1)" } },
  ]) {
    const findings = checkConfig({
      ...valid(),
      widgets,
      rules: [null, { scenarios: { some: true } }],
    });
    assert.ok(findings.length > 0);
  }
  const config = valid();
  config.widgets.widget = {
    bundleUrls: ["", "legacy.js"],
    bundleUrl: "https://example.com/ignored.js",
  };
  assert.ok(checkConfig(config).some((f) => f.id === "widget-bundle-widget"));
});
test("manual and URL rule conditions are guidance rather than claims of an evaluated failure", () => {
  const config = valid();
  config.rules[0].triggerMode = "manual";
  config.rules[0].scenarios = [{ scenarioId: "path_not_matches" }];
  const findings = checkConfig(config, {
    country: "FR",
    didomi_country: "US",
    pathname: "/index.html",
  });
  for (const id of ["manual-rules", "path-rules", "geo-overrides"])
    assert.equal(findings.find((f) => f.id === id).severity, "info");
  assert.match(
    findings.find((f) => f.id === "path-rules").suggestion,
    /does not identify a winning rule/,
  );
});
test("runtime suggestions distinguish Console actions from browser restrictions", () => {
  assert.match(
    eventSuggestion({
      message: "Didomi - No bundle URL for widget",
      kind: "SDK console",
    }),
    /Flows → Privacy Widgets/,
  );
  assert.match(
    eventSuggestion({
      message: "No widgets are configured",
      kind: "SDK console",
    }),
    /Flows → Regulations/,
  );
  assert.match(
    eventSuggestion({ message: "Blocked", kind: "Resource load" }),
    /do not reveal an HTTP status/,
  );
  assert.match(
    eventSuggestion({ message: "Script error.", kind: "Page exception" }),
    /hid details/,
  );
});

test("empty or missing rules warn about widget initialization even with a valid default and asset", () => {
  for (const rules of [[], undefined]) {
    const config = { ...valid(), rules };
    const finding = checkConfig(config).find(
      (f) => f.id === "widget-rules-empty",
    );
    assert.equal(finding.severity, "warning");
    assert.match(
      finding.suggestion,
      /even with a valid default widget and bundle URL/,
    );
    assert.match(finding.suggestion, /SDK can still load/);
    assert.match(finding.suggestion, /confirm the expected behavior/);
    assert.match(finding.suggestion, /does not establish a setup error/);
  }
  for (const config of [
    valid(),
    { ...valid(), rules: "invalid" },
    { app: { apiKey: "key" }, regulation: { name: "gdpr" }, rules: [] },
  ])
    assert.equal(
      checkConfig(config).some((f) => f.id === "widget-rules-empty"),
      false,
    );
});
