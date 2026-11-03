import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { describeGCM, signalRows } from "../scripts/flows-data-layer.mjs";
const source = readFileSync(
  new URL("../scripts/flows-data-layer-capture.js", import.meta.url),
  "utf8",
);
function setup() {
  let tick;
  const context = vm.createContext({
    setInterval: (fn) => {
      tick = fn;
    },
  });
  context.window = context;
  vm.runInContext(source, context);
  return {
    context,
    tick: () => tick(),
    capture: context.flowDataLayerCapture,
    run: (code) => vm.runInContext(code, context),
  };
}
const plain = (value) => JSON.parse(JSON.stringify(value));
test("capture does not create queues; normalizes arguments and preserves push receiver, return and throws", () => {
  const { run, capture, tick } = setup();
  assert.equal(run('"dataLayer" in window'), false);
  run(
    `window.dataLayer=[]; window.receivers=[]; window.dataLayer.push=function(...args){ receivers.push(this===dataLayer); Array.prototype.push.apply(this,args); return 'original return'; };`,
  );
  tick();
  assert.equal(
    run(
      `(function(){return dataLayer.push(arguments)})('consent','default',{ad_storage:'denied'})`,
    ),
    "original return",
  );
  assert.deepEqual(plain(capture.entries[0].value), [
    "consent",
    "default",
    { ad_storage: "denied" },
  ]);
  assert.equal(run("receivers[0]"), true);
  assert.equal(capture.entries[0].source, "push observed");
  run(
    'window.failure=new Error("original failure");dataLayer.push=function(){throw failure;}',
  );
  tick();
  assert.throws(
    () => run('dataLayer.push({event:"bad"})'),
    (e) => e === run("failure"),
  );
  assert.equal(capture.entries.length, 1);
});
test("pre-existing queues, replacements, custom layers and read-only push are sampled without replay after clear", () => {
  const { run, capture, tick } = setup();
  run(
    'window.custom=[{event:"early"}];Object.defineProperty(custom,"push",{value:Array.prototype.push,writable:false});',
  );
  capture.configure({
    integrations: { vendors: { gcm: { dataLayerName: "custom" } } },
    tagManager: { dataLayerName: "tags" },
  });
  assert.match(capture.entries[0].source, /original time unknown/);
  assert.match(
    capture.layers.find((l) => l.name === "custom").status,
    /Read-only/,
  );
  run(
    'Array.prototype.push.call(custom,{event:"later"}); window.tags=[{event:"tags"}]',
  );
  tick();
  assert.equal(capture.entries.length, 3);
  assert.equal(run("custom.length"), 2);
  capture.clear();
  tick();
  assert.equal(capture.entries.length, 0);
  assert.equal(run("custom.length"), 2);
  run('window.custom=[{event:"replacement"}]');
  tick();
  assert.equal(capture.entries.length, 1);
  assert.equal(capture.entries[0].value.event, "replacement");
  run("window.tags={push(){}}");
  tick();
  assert.match(
    capture.layers.find((l) => l.name === "tags").status,
    /Unsupported/,
  );
});
test("delegating replacement push and aliased queues are not double recorded", () => {
  const { run, capture, tick } = setup();
  run("window.dataLayer=[]");
  tick();
  run("window.tags=dataLayer");
  capture.configure({ tagManager: { dataLayerName: "tags" } });
  run(
    "window.oldPush=dataLayer.push;dataLayer.push=function(...args){return oldPush.apply(this,args)}",
  );
  tick();
  assert.equal(run('dataLayer.push({event:"once"})'), 1);
  tick();
  assert.equal(capture.entries.length, 1);
  assert.deepEqual(plain(capture.entries[0].layers), ["dataLayer", "tags"]);
});
test("snapshots tolerate cycles, accessors and hostile text, and keep history bounded", () => {
  const { run, capture, tick } = setup();
  run("window.dataLayer=[]");
  tick();
  run(
    `window.getters=0;let circular={event:'<img src=x onerror=alert(1)>'};circular.self=circular; Object.defineProperty(circular,'secret',{enumerable:true,get(){getters++;throw 1;}});Object.defineProperty(circular,Symbol.toStringTag,{get(){getters++;throw 1;}});dataLayer.push(circular);`,
  );
  assert.equal(run("getters"), 0);
  assert.match(capture.entries[0].value.self, /Circular/);
  assert.equal(capture.entries[0].value.secret, "[Accessor not read]");
  run('for(let i=0;i<205;i++)dataLayer.push({event:"event"+i});');
  assert.equal(capture.entries.length, 200);
  assert.equal(capture.dropped, 6);
  assert.equal(run("dataLayer.length"), 206);
  assert.match(capture.snapshot("x".repeat(3000)), /Truncated/);
});
test("GCM interpretation distinguishes disabled, default policy, mixed regulations, GPC and TCF-managed updates", () => {
  assert.match(describeGCM({}, false).notes[0], /not enabled/);
  assert.match(
    describeGCM(
      { integrations: { vendors: { gcm: { enable: true } } } },
      false,
    ).notes.join(" "),
    /legitimately emit no default/,
  );
  const config = {
    regulation: { group: { name: "mixed" } },
    integrations: {
      vendors: {
        gcm: {
          enable: true,
          setDefaultStatus: true,
          enableTCFAdvertiserConsentMode: true,
          defaultStatus: { ad: false },
        },
      },
    },
  };
  const notes = describeGCM(config, true).notes.join(" ");
  for (const expected of [
    "GPC",
    "Stored choices",
    "Mixed-group",
    "TCF manages",
  ])
    assert.ok(notes.includes(expected));
  const rows = signalRows(config, [
    {
      layers: ["dataLayer"],
      value: ["consent", "default", { ad_storage: "denied" }],
    },
    {
      layers: ["other"],
      value: ["consent", "update", { ad_storage: "granted" }],
    },
    {
      layers: ["dataLayer"],
      value: ["consent", "update", { analytics_storage: "granted" }],
    },
  ]);
  assert.equal(rows.length, 7);
  assert.equal(rows[0].configured, "denied");
  assert.equal(rows[0].default, "denied");
  assert.match(rows[0].update, /TCF-managed/);
  assert.equal(rows[1].update, "granted");
});

test("stored-choice detection excludes defaults, fresh identities, none and other regulations", async () => {
  const { hasStoredChoice } = await import(
    "../scripts/flows-consent-strings.mjs"
  );
  const config = { regulation: { name: "gdpr" } };
  const status = { regulation: "gdpr", updated: "2026-01-01T00:00:00Z" };
  const started = Date.parse("2026-01-02T00:00:00Z");
  assert.equal(hasStoredChoice(status, config, false, started), true);
  assert.equal(hasStoredChoice(status, config, true, started), false);
  assert.equal(hasStoredChoice(status, config, undefined, started), false);
  assert.equal(
    hasStoredChoice(
      { ...status, updated: "2026-01-03T00:00:00Z" },
      config,
      false,
      started,
    ),
    false,
  );
  assert.equal(
    hasStoredChoice(
      { regulation: "gdpr", user_id: "new-user" },
      config,
      false,
      started,
    ),
    false,
  );
  assert.equal(
    hasStoredChoice(
      { ...status, regulation: "none" },
      { regulation: { name: "none" } },
      false,
      started,
    ),
    false,
  );
  assert.equal(
    hasStoredChoice(status, { regulation: { name: "cpra" } }, false, started),
    false,
  );
});
