const { test, expect } = require("@playwright/test");

async function open(page, mode = "ready") {
  await page.route("https://sdk*/**", (route) =>
    route.fulfill({
      contentType: "application/javascript",
      body: `
    window.frameworkCalls=[];window.frameworkListeners={};window.removed=[];
    window.__tcfapi=(command,version,callback,id)=>{
      frameworkCalls.push(['tcf',command]);
      if(command==='ping')callback({cmpStatus:'loaded',cmpLoaded:true,gdprApplies:true,apiVersion:'2'});
      if(command==='addEventListener'){frameworkListeners.tcf=callback;callback({listenerId:0,cmpStatus:'loaded',eventStatus:'tcloaded',tcString:'TC-current'},true);}
      if(command==='removeEventListener'){removed.push(['tcf',id]);callback(true);}
    };
    window.__gpp=(command,callback,id)=>{
      frameworkCalls.push(['gpp',command]);
      const ping={cmpStatus:'loaded',signalStatus:'ready',cmpDisplayStatus:'hidden',applicableSections:[8],gppString:'GPP-current',parsedSections:{usca:{Gpc:true}}};
      if(command==='ping')callback(ping,true);
      if(command==='addEventListener'){frameworkListeners.gpp=callback;callback({listenerId:1,eventName:'listenerRegistered',pingData:ping},true);}
      if(command==='removeEventListener'){removed.push(['gpp',id]);callback({data:true},true);}
    };
    if(${JSON.stringify(mode)}==='queued') window.__tcfapi=Object.assign(()=>{}, {stub:true});
    if(${JSON.stringify(mode)}==='disabled'){delete window.__gpp;delete window.__tcfapi;}
    window.Didomi={getConfig:()=>({regulation:{name:'gdpr',framework_settings:{tcf_enabled:${mode !== "disabled"},gpp_enabled:${mode !== "disabled"}}},widgets:{widget:{bundleUrl:'https://example.com/widget.js'}}}),getCurrentUserStatus:()=>({regulation:'gdpr',consent_string:'TC-current',gpp_string:'GPP-current'}),widgets:{isVisible:()=>false},on:()=>{}};
    (window.didomiOnReady||[]).forEach(callback=>callback());
  `,
    }),
  );
  await page.goto("/index.html?apiKey=key&flow_id=flow#test");
  await page.locator("#framework-title").click();
  await expect(page.locator("#status")).toContainText("SDK ready");
}

test("framework responses, copy, clear and cleanup are read-only and independent", async ({
  page,
}) => {
  await open(page);
  await expect(page.locator("[data-framework-status=tcf]")).toContainText(
    "ready",
  );
  await expect(page.locator("[data-framework-status=gpp]")).toContainText(
    "ready",
  );
  await expect(page.locator("[data-framework-evidence=gpp]")).toContainText(
    "matches the shared SDK snapshot",
  );
  await expect(page.locator("[data-framework-raw=gpp]")).toContainText(
    "parsedSections",
  );
  await page.evaluate(() =>
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async (text) => {
          window.copiedReport = text;
        },
      },
    }),
  );
  await page.locator("[data-framework-copy]").click();
  const copied = await page.evaluate(() => JSON.parse(window.copiedReport));
  expect(copied.value.reports.gpp.events.response.pingData.gppString).toBe(
    "GPP-current",
  );
  await page.locator("[data-framework-clear]").click();
  await expect(page.locator("[data-framework-status=tcf]")).toContainText(
    "cleared",
  );
  await expect(page.locator("[data-framework-copy]")).toBeDisabled();
  expect(await page.evaluate(() => removed)).toContainEqual(["tcf", 0]);
  const callsAfterClear = await page.evaluate(() => frameworkCalls.length);
  await page.evaluate(() =>
    (window.didomiOnReady || []).forEach((callback) => callback()),
  );
  expect(await page.evaluate(() => frameworkCalls.length)).toBe(
    callsAfterClear,
  );

  await page.evaluate(() =>
    frameworkListeners.tcf({ listenerId: 0, cmpStatus: "error" }, true),
  );
  await expect(page.locator("[data-framework-status=tcf]")).toContainText(
    "cleared",
  );
  const commands = await page.evaluate(() =>
    frameworkCalls.map((call) => call[1]),
  );
  expect(
    commands.every((command) =>
      ["ping", "addEventListener", "removeEventListener"].includes(command),
    ),
  ).toBe(true);
  expect(page.url()).not.toContain("TC-current");
});

test("queued stubs time out without blocking GPP; delayed readiness recovers and user events update", async ({
  page,
}) => {
  await open(page, "queued");
  await expect(page.locator("[data-framework-status=tcf]")).toContainText(
    "stub/loading",
  );
  await expect(page.locator("[data-framework-status=gpp]")).toContainText(
    "ready",
  );
  await expect(page.locator("[data-framework-status=tcf]")).toContainText(
    "timed out",
    { timeout: 8000 },
  );
  await page.evaluate(() => {
    window.__tcfapi = (cmd, ver, cb) => {
      if (cmd === "ping") cb({ cmpLoaded: true, cmpStatus: "loaded" });
      if (cmd === "addEventListener") {
        frameworkListeners.tcf = cb;
        cb(
          {
            cmpStatus: "loaded",
            eventStatus: "useractioncomplete",
            listenerId: 3,
            tcString: "TC-new",
          },
          true,
        );
      }
    };
  });
  await expect(page.locator("[data-framework-status=tcf]")).toContainText(
    "ready",
  );
  await expect(page.locator("[data-framework-evidence=tcf]")).toContainText(
    "differ",
  );
  await page.evaluate(() =>
    frameworkListeners.gpp(
      {
        listenerId: 1,
        eventName: "signalStatus",
        pingData: {
          cmpStatus: "loaded",
          signalStatus: "ready",
          applicableSections: [-1],
          gppString: "DBAA",
        },
      },
      true,
    ),
  );
  await expect(page.locator("[data-framework-status=gpp]")).toContainText(
    "not applicable",
  );
});

test("absent APIs with disabled config are evidence, not successful readiness", async ({
  page,
}) => {
  await open(page, "disabled");
  await expect(page.locator("[data-framework-status=gpp]")).toContainText(
    "absent",
  );
  await expect(page.locator("[data-framework-evidence=gpp]")).toContainText(
    "explicitly reports",
  );
  await expect(page.locator("[data-framework-status=tcf]")).not.toContainText(
    "ready",
  );
});
