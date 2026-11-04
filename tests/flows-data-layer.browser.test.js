const { test, expect } = require("@playwright/test");
const config = {
  regulation: { name: "gdpr", group: { name: "optin" } },
  integrations: {
    vendors: {
      gcm: {
        enable: true,
        setDefaultStatus: true,
        dataLayerName: "consentQueue",
        defaultStatus: { ad: false, analytics: false, security: true },
      },
    },
  },
  tagManager: { provider: "gtm", dataLayerName: "tagQueue" },
};
async function sdk(page, settings = config, startup = "") {
  await page.route("https://sdk*/**", (route) =>
    route.fulfill({
      contentType: "application/javascript",
      body: `
    ${startup}
    window.fixtureConfig=${JSON.stringify(settings)};
    window.Didomi={getConfig:()=>fixtureConfig,widgets:{isVisible:()=>false,show(){},hide(){}}};
    (window.didomiOnReady||[]).forEach(callback=>callback());
  `,
    }),
  );
  await page.goto("/index.html?apiKey=key&flow_id=flow#test");
  await expect(page.locator("#status")).toContainText("SDK ready");
  await page.getByRole("tab", { name: "2. Test", exact: true }).click();
  await page.locator("#data-layer-title").click();
}
test("captures startup and custom-layer consent commands, filters/copies evidence, and clears only the view", async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.dataLayer = [];
  });
  await sdk(
    page,
    config,
    `
    dataLayer.push({event:'startup'});
    window.consentQueue=[];
    (function(){consentQueue.push(arguments)})('consent','default',{ad_storage:'denied',analytics_storage:'denied',security_storage:'granted'});
    window.tagQueue=[{event:'didomi-ready'}];
  `,
  );
  const history = page.locator("#data-layer-history");
  await expect(history).toContainText("startup");
  await expect(history).toContainText("consent default");
  await expect(history).toContainText("didomi-ready");
  await expect(history).toContainText("original time unknown");
  const firstRow = page.locator("#data-layer-signals tr").first();
  await expect(firstRow).toContainText("denied");
  await page.evaluate(() => {
    window.updateResult = consentQueue.push([
      "consent",
      "update",
      { ad_storage: "granted", analytics_storage: "granted" },
    ]);
    tagQueue.push({ event: "didomi-consent-changed" });
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async (value) => {
          window.copiedDiagnostics = value;
        },
      },
    });
  });
  await expect(firstRow).toContainText("granted");
  await page.locator("#data-layer-filter").fill("consent update");
  await expect(history.locator("li")).toHaveCount(1);
  await page
    .getByRole("button", { name: "Copy filtered diagnostics", exact: true })
    .click();
  const copied = await page.evaluate(() => JSON.parse(copiedDiagnostics));
  expect(copied.entries).toHaveLength(1);
  expect(copied.entries[0].value[1]).toBe("update");
  expect(copied.settings.GCMDataLayer).toBe("consentQueue");
  await page.locator("#data-layer-filter").fill("");
  const before = await page.evaluate(() => ({
    commands: JSON.stringify(consentQueue),
    tags: JSON.stringify(tagQueue),
    url: location.href,
    result: updateResult,
  }));
  expect(before.result).toBe(2);
  await page
    .getByRole("button", { name: "Clear diagnostic view", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Refresh data layer", exact: true })
    .click();
  await expect(history).toContainText("No entries captured");
  expect(
    await page.evaluate(() => ({
      commands: JSON.stringify(consentQueue),
      tags: JSON.stringify(tagQueue),
      url: location.href,
      result: updateResult,
    })),
  ).toEqual(before);
});
test("handles late queues, read-only push, replacements and unsafe event values without executing them", async ({
  page,
}) => {
  await sdk(page);
  await page.evaluate(() => {
    window.tagQueue = [];
    Object.defineProperty(tagQueue, "push", {
      value: Array.prototype.push,
      writable: false,
    });
    window.consentQueue = [];
  });
  await expect(page.locator("#data-layer-status")).toContainText(
    "Read-only push",
  );
  await page.evaluate(() => {
    let entry = { event: '<img src=x onerror="window.injected=true">' };
    entry.cycle = entry;
    consentQueue.push(entry);
    Array.prototype.push.call(tagQueue, { event: "sampled" });
  });
  await expect(page.locator("#data-layer-history")).toContainText("<img");
  await expect(page.locator("#data-layer-history")).toContainText("sampled");
  expect(await page.evaluate(() => window.injected)).toBeUndefined();
  await expect(page.locator("#data-layer-history img")).toHaveCount(0);
  await page.evaluate(() => {
    window.consentQueue = [["consent", "update", { ad_storage: "denied" }]];
  });
  await expect(page.locator("#data-layer-signals tr").first()).toContainText(
    "denied",
  );
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
test("explains GCM disabled, fresh opt-in with defaults off, and GPC/mixed/TCF settings without fabricating commands", async ({
  page,
}) => {
  await sdk(page, {});
  await expect(page.locator("#data-layer-notes")).toContainText("not enabled");
  await expect(page.locator("#data-layer-status")).toContainText(
    "dataLayer: Not present",
  );
  expect(await page.evaluate(() => "dataLayer" in window)).toBe(false);
  await page.evaluate(() => {
    fixtureConfig = {
      integrations: {
        vendors: { gcm: { enable: true, setDefaultStatus: false } },
      },
    };
  });
  await page
    .getByRole("button", { name: "Refresh data layer", exact: true })
    .click();
  await expect(page.locator("#data-layer-notes")).toContainText(
    "legitimately emit no default",
  );
  await page.evaluate(() => {
    Object.defineProperty(navigator, "globalPrivacyControl", {
      configurable: true,
      value: true,
    });
    fixtureConfig = {
      regulation: { name: "cpra", group: { name: "mixed" } },
      integrations: {
        vendors: {
          gcm: {
            enable: true,
            setDefaultStatus: true,
            enableTCFAdvertiserConsentMode: true,
          },
        },
      },
    };
  });
  await page
    .getByRole("button", { name: "Refresh data layer", exact: true })
    .click();
  await expect(page.locator("#data-layer-notes")).toContainText("GPC");
  await expect(page.locator("#data-layer-notes")).toContainText(
    "Stored choices",
  );
  await expect(page.locator("#data-layer-notes")).toContainText("Mixed-group");
  await expect(page.locator("#data-layer-signals")).toContainText(
    "TCF-managed",
  );
  await expect(page.locator("#data-layer-history")).toContainText(
    "No entries captured",
  );
  expect(await page.evaluate(() => "dataLayer" in window)).toBe(false);
});

test("test tab sections are ordered and collapsible with keyboard navigation", async ({
  page,
}) => {
  await sdk(page);
  const sections = page.locator("#test-panel > details.test-section");
  expect(await sections.locator(":scope > summary").allTextContents()).toEqual(
    expect.arrayContaining([
      expect.stringContaining("Widget controls"),
      expect.stringContaining("Consent strings"),
      expect.stringContaining("Google Consent Mode"),
      expect.stringContaining("URL-pattern test"),
    ]),
  );
  await expect(sections).toHaveCount(4);
  const labels = await sections
    .locator(":scope > summary h2")
    .allTextContents();
  expect(labels).toEqual([
    "Widget controls",
    "Consent strings",
    "Data layer and Google Consent Mode",
    "URL-pattern test",
  ]);
  const summary = sections.nth(2).locator(":scope > summary");
  await summary.focus();
  await summary.press("Enter");
  await expect(page.locator("#data-layer-filter")).toBeHidden();
  await summary.press("Space");
  await expect(page.locator("#data-layer-filter")).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("consent strings populate on ready and after a choice, including delayed storage and stale async results", async ({
  page,
}) => {
  await page.route("https://sdk*/**", (route) =>
    route.fulfill({
      contentType: "application/javascript",
      body: `
   window.listeners={};window.snapshot={consent_string:'initial-TC',gpp_string:'initial-GPP'};
   window.Didomi={getConfig:()=>({regulation:{name:'gdpr'}}),getCurrentUserStatus:()=>snapshot,on:(event,callback)=>{(listeners[event] ||= []).push(callback)}};
   (window.didomiOnReady||[]).forEach(callback=>callback());
 `,
    }),
  );
  await page.goto("/index.html?apiKey=key&flow_id=flow#test");
  await expect(page.locator("#tc-string")).toHaveValue("initial-TC");
  await expect(page.locator("#gpp-string")).toHaveValue("initial-GPP");
  await page.getByRole("tab", { name: "2. Test", exact: true }).click();
  // Begin an old read, then make a choice while it is still pending.
  await page.evaluate(() => {
    Didomi.getCurrentUserStatus = () =>
      new Promise((resolve) => (window.resolveOld = resolve));
  });
  await page.locator("#read-consent-strings").click();
  await page.evaluate(() => {
    snapshot = { consent_string: "chosen-TC", gpp_string: "chosen-GPP" };
    Didomi.getCurrentUserStatus = () => snapshot;
    listeners["consent.changed"].forEach((callback) => callback());
    setTimeout(
      () => localStorage.setItem("didomi_dcs", "chosen-DCS.signed"),
      150,
    );
  });
  await expect(page.locator("#tc-string")).toHaveValue("chosen-TC");
  await expect(page.locator("#gpp-string")).toHaveValue("chosen-GPP");
  await expect(page.locator("#dcs-string")).toHaveValue("chosen-DCS.signed");
  await page.evaluate(() => resolveOld({ consent_string: "stale-TC" }));
  await expect(page.locator("#tc-string")).toHaveValue("chosen-TC");
  await expect(page.locator("#decode-tc-string")).toHaveAttribute(
    "href",
    "https://iabgpp.com/#chosen-TC",
  );
  expect(await page.evaluate(() => localStorage.getItem("test-reset"))).toBe(
    null,
  );
});

test("local preview serves fresh modules despite conditional cache headers", async ({
  request,
}) => {
  const response = await request.get("/scripts/flows-consent-strings.mjs", {
    headers: { "If-Modified-Since": "Wed, 01 Jan 2099 00:00:00 GMT" },
  });
  expect(response.status()).toBe(200);
  expect(response.headers()["cache-control"]).toBe("no-store");
});

test("stored consent hydrates strings and GCM on load and offers explicit reset or preview actions", async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      "saved-consent",
      JSON.stringify({
        regulation: "gdpr",
        updated: "2026-01-01T00:00:00Z",
        consent_string: "stored-TC",
        gpp_string: "stored-GPP",
      }),
    );
    localStorage.setItem("didomi_dcs", "stored-DCS.signed");
  });
  await page.route("https://sdk*/**", (route) =>
    route.fulfill({
      contentType: "application/javascript",
      body: `
   window.visible=false;window.showCalls=0;
   window.dataLayer=[['consent','update',{ad_storage:'granted',analytics_storage:'granted'}]];
   window.Didomi={
     getConfig:()=>({regulation:{name:'gdpr'},integrations:{vendors:{gcm:{enable:true,setDefaultStatus:true}}}}),
     getCurrentUserStatus:()=>JSON.parse(localStorage.getItem('saved-consent')),
     shouldUserStatusBeCollected:()=>false,
     widgets:{isVisible:()=>visible,show:()=>{visible=true;showCalls++},hide:()=>{visible=false}},
     reset:()=>{localStorage.removeItem('saved-consent');localStorage.removeItem('didomi_dcs');}
   };
   (window.didomiOnReady||[]).forEach(callback=>callback());
 `,
    }),
  );
  await page.goto("/index.html?apiKey=key&flow_id=flow#test");
  await expect(page.locator("#tc-string")).toHaveValue("stored-TC");
  await expect(page.locator("#gpp-string")).toHaveValue("stored-GPP");
  await expect(page.locator("#dcs-string")).toHaveValue("stored-DCS.signed");
  await expect(page.locator("#stored-consent-banner")).toBeVisible();
  await expect(page.locator("#stored-consent-banner")).toContainText(
    "Existing consent choice",
  );
  await page
    .getByRole("button", { name: "Show widget again", exact: true })
    .click();
  expect(await page.evaluate(() => showCalls)).toBe(1);
  expect(
    await page.evaluate(() => localStorage.getItem("saved-consent")),
  ).not.toBe(null);
  await page.getByRole("button", { name: "Hide preview", exact: true }).click();
  await page.locator("#data-layer-title").click();
  await expect(page.locator("#data-layer-signals tr").first()).toContainText(
    "granted",
  );
  // No reset or new consent action was needed to hydrate the fields above.
  await page.evaluate(() => {
    Didomi.shouldUserStatusBeCollected = () => true;
  });
  await page.locator("#read-consent-strings").click();
  await expect(page.locator("#stored-consent-banner")).toBeHidden();
});
