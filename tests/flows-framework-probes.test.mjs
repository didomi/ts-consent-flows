import test from "node:test";
import assert from "node:assert/strict";
import {
  createFrameworkProbe,
  frameworkPhase,
} from "../scripts/flows-framework-probes.mjs";

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test("readiness requires observed status; none and disabled applicability are distinct", () => {
  assert.equal(frameworkPhase("tcf", {}), "responded");
  assert.equal(
    frameworkPhase("tcf", { cmpStatus: "stub", gdprApplies: false }),
    "stub/loading",
  );
  assert.equal(
    frameworkPhase("tcf", { cmpStatus: "loaded", cmpLoaded: true }),
    "ready",
  );
  assert.equal(
    frameworkPhase("tcf", { cmpStatus: "loaded", gdprApplies: false }),
    "not applicable",
  );
  assert.equal(
    frameworkPhase("gpp", { cmpStatus: "loaded", signalStatus: "not ready" }),
    "responded",
  );
  assert.equal(
    frameworkPhase("gpp", {
      cmpStatus: "loaded",
      signalStatus: "ready",
      applicableSections: [-1],
      gppString: "DBAA",
    }),
    "not applicable",
  );
  assert.equal(frameworkPhase("gpp", { cmpStatus: "error" }), "error");
});

test("ping timeout is independent of ready event data and malformed callbacks", async () => {
  let events;
  let report;
  const api = (command, version, callback) => {
    assert.equal(version, 2);
    if (command === "addEventListener") events = callback;
  };
  const probe = createFrameworkProbe(
    "tcf",
    () => api,
    (value) => (report = value),
    { timeout: 10 },
  );
  probe.refresh();
  events(
    {
      listenerId: 0,
      cmpStatus: "loaded",
      eventStatus: "tcloaded",
      tcString: "TC",
    },
    true,
  );
  await wait(25);
  assert.equal(report.ping.phase, "timed out");
  assert.equal(report.events.phase, "ready");
  events(null, false);
  assert.equal(report.events.phase, "error");
  assert.equal(report.events.success, false);
  probe.dispose();
});

test("refresh and clear remove known and late listener IDs without stale updates", () => {
  const listeners = [];
  const removed = [];
  let report;
  const api = (command, callback, id) => {
    if (command === "addEventListener") listeners.push(callback);
    if (command === "removeEventListener") removed.push(id);
    if (command === "ping") callback({ cmpStatus: "stub" }, true);
  };
  const probe = createFrameworkProbe(
    "gpp",
    () => api,
    (value) => (report = value),
  );
  probe.refresh();
  probe.refresh();
  listeners[0](
    { listenerId: 0, pingData: { cmpStatus: "loaded", signalStatus: "ready" } },
    true,
  );
  assert.deepEqual(removed, [0]);
  assert.equal(report.events.phase, "probing");
  listeners[1](
    { listenerId: 1, pingData: { cmpStatus: "loaded", signalStatus: "ready" } },
    true,
  );
  assert.equal(report.events.phase, "ready");
  probe.clear();
  assert.deepEqual(removed, [0, 1]);
  assert.equal(report.history.length, 0);
  listeners[1]({ listenerId: 1, pingData: { cmpStatus: "error" } }, true);
  assert.equal(report.events.phase, "cleared");
  probe.dispose();
});

test("API replacement, bounded detached history, and synchronous failures are isolated", () => {
  let report;
  let listener;
  let api;
  const probe = createFrameworkProbe(
    "gpp",
    () => api,
    (value) => (report = value),
    { historyLimit: 3 },
  );
  probe.refresh();
  assert.equal(report.ping.phase, "absent");
  api = (cmd, cb) => {
    if (cmd === "ping") throw Error("ping failed");
    if (cmd === "addEventListener") listener = cb;
  };
  assert.equal(probe.apiChanged(), true);
  probe.refresh();
  assert.equal(report.ping.phase, "error");
  let accessed = 0;
  const payload = {
    listenerId: 2,
    pingData: { cmpStatus: "loaded", signalStatus: "ready", gppString: "GPP" },
  };
  Object.defineProperty(payload, "unsafe", {
    enumerable: true,
    get() {
      accessed++;
    },
  });
  for (let i = 0; i < 8; i++) listener(payload, true);
  payload.pingData.gppString = "changed";
  assert.equal(report.events.response.pingData.gppString, "GPP");
  assert.equal(accessed, 0);
  assert.equal(report.history.length, 3);
  assert.equal(report.events.response.unsafe, "[Accessor not read]");
  probe.dispose();
});

test("late queued-stub listener registration is removed through its replacement API", () => {
  let queued;
  const removed = [];
  let api;
  const stub = Object.assign(
    (command, version, callback) => {
      if (command === "addEventListener") queued = callback;
    },
    { stub: true },
  );
  api = stub;
  const probe = createFrameworkProbe(
    "tcf",
    () => api,
    () => {},
  );
  probe.refresh();
  probe.clear();
  api = (command, version, callback, id) => {
    if (command === "removeEventListener") removed.push(id);
  };
  queued({ listenerId: 4, cmpStatus: "loaded", eventStatus: "tcloaded" }, true);
  assert.deepEqual(removed, [4]);
  probe.dispose();
});
