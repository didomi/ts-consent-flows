import test from "node:test";
import assert from "node:assert/strict";
import {
  captureConsentData,
  consentRows,
  describeConsentCollection,
  consentInterpretation,
  consentMetadata,
} from "../scripts/flows-consent-state.mjs";

test("effective states preserve false, missing, non-boolean values and exact namespaces", () => {
  const status = {
    "iab:1": { id: "iab:1", enabled: true },
    "c:1": { id: "c:1", enabled: false },
    1: { id: "1" },
    unknown: null,
    malformed: { enabled: "false" },
  };
  const rows = consentRows(
    status,
    new Map([["c:1", { name: "Custom entity", namespace: "custom" }]]),
  );
  assert.equal(rows.find((r) => r.id === "iab:1").state, "Enabled");
  assert.equal(rows.find((r) => r.id === "c:1").state, "Disabled");
  assert.equal(rows.find((r) => r.id === "c:1").namespace, "custom");
  assert.equal(rows.find((r) => r.id === "1").state, "Unknown");
  assert.equal(rows.find((r) => r.id === "malformed").state, "Unknown");
  assert.match(
    describeConsentCollection(status, rows, "Purpose"),
    /1 enabled · 1 disabled · 3 unknown/,
  );
  assert.match(
    describeConsentCollection({}, [], "Vendor"),
    /No vendor entries/,
  );
  assert.match(
    describeConsentCollection(undefined, [], "Vendor"),
    /not returned/,
  );
  assert.match(
    describeConsentCollection([], [], "Vendor"),
    /unsupported shape/,
  );
});

test("default, essential, bot and none states never imply explicit acceptance", () => {
  for (const status of [
    { regulation: "gdpr" },
    { regulation: "cpra" },
    { regulation: "none" },
    { bot: true },
  ]) {
    const description = consentInterpretation(status, false);
    assert.match(description, /not proof of an explicit agreement/);
    assert.match(description, /bot exemptions/);
    assert.match(description, /does not prove an explicit or saved choice/);
  }
  assert.match(consentInterpretation({}, true), /initial\/default/);
  assert.match(consentInterpretation({}, undefined), /unavailable/);
});

test("snapshots handle circular/unsafe values without invoking getters or toJSON", () => {
  let calls = 0;
  const value = {
    text: '<img src=x onerror="bad()">',
    toJSON() {
      calls++;
    },
  };
  Object.defineProperty(value, "getter", {
    enumerable: true,
    get() {
      calls++;
      throw Error();
    },
  });
  value.circular = value;
  const captured = captureConsentData(value);
  assert.equal(calls, 0);
  assert.equal(captured.value.text, value.text);
  assert.equal(captured.value.getter, "[Accessor not read]");
  assert.match(captured.value.circular, /Circular/);
  assert.doesNotThrow(() => JSON.stringify(captured.value));
  const large = captureConsentData({
    string: "a".repeat(30000),
    entries: Array.from({ length: 11000 }, (_, id) => id),
  });
  assert.ok(large.notes.some((note) => /limits/.test(note)));
  assert.equal(large.value.entries.length, 10000);
});

test("names come from exact SDK/config IDs without treating metadata as consent", () => {
  const status = {
    purposes: { "iab:1": { enabled: true }, "c:1": {} },
    vendors: { "c:vendor": {} },
  };
  const calls = [];
  const sdk = {
    getPurposeById(id) {
      calls.push(id);
      return id === "iab:1"
        ? { name: "IAB purpose", namespace: "iab" }
        : undefined;
    },
    getVendorById() {
      throw Error("No metadata");
    },
  };
  const metadata = consentMetadata(status, sdk, {
    app: {
      purposes: { custom: [{ id: "c:1", name: "Custom purpose" }] },
      vendors: {
        custom: { "c:vendor": { name: "Custom vendor", namespace: "custom" } },
      },
    },
  });
  assert.deepEqual(calls, ["iab:1", "c:1"]);
  assert.equal(metadata.purposes.get("c:1").name, "Custom purpose");
  assert.equal(metadata.vendors.get("c:vendor").name, "Custom vendor");
  assert.equal(
    consentRows(status.purposes, metadata.purposes).find(
      (row) => row.id === "c:1",
    ).state,
    "Unknown",
  );
});
