import test from "node:test";
import assert from "node:assert/strict";
import { readFlowType, flowTypeURL } from "../scripts/flows-mode.mjs";

test("existing and explicit consent links remain consent links regardless of regulation", () => {
  for (const query of [
    "",
    "flow_type=",
    "regulation=gdpr",
    "flow_type=consent&regulation=cpra",
  ])
    assert.equal(readFlowType(new URLSearchParams(query)), "consent");
  assert.equal(
    readFlowType(new URLSearchParams("flow_type=dsr&regulation=gdpr")),
    "dsr",
  );
  assert.throws(
    () => readFlowType(new URLSearchParams("flow_type=unknown")),
    /Unsupported Flow type/,
  );
});

test("switching products preserves only organization and environments on the same deployment", () => {
  const original =
    "https://example.com/nested/index.html?apiKey=public-key&flow_id=consent-flow&target=old&target_type=flow&environment=staging&sdk_environment=staging&platform=ctv&commit_hash=latest&gpp_stub=1&config=private-settings&apply_conf=1&organization_user_id=test-identity&widget_id=widget&extra=unknown#test";
  const dsr = flowTypeURL("dsr", original);
  assert.equal(
    dsr.href,
    "https://example.com/nested/index.html?apiKey=public-key&environment=staging&sdk_environment=staging&flow_type=dsr#setup",
  );
  const consent = flowTypeURL("consent", dsr);
  assert.equal(
    consent.href,
    "https://example.com/nested/index.html?apiKey=public-key&environment=staging&sdk_environment=staging#setup",
  );
  assert.throws(
    () => flowTypeURL("unknown", original),
    /Unsupported Flow type/,
  );
});
