const { test, expect } = require("@playwright/test");

async function fixture(page, options = {}) {
  await page.route("https://sdk*/**", (route) =>
    route.fulfill({
      contentType: "application/javascript",
      body: `
      window.fixtureOptions=${JSON.stringify(options)};
      window.choice={regulation:'gdpr', purposes:{'iab:1':{id:'iab:1',enabled:true},'c:1':{id:'c:1',enabled:false},unknown:{id:'unknown'}},vendors:{'c:vendor':{id:'c:vendor',enabled:false}},consent_string:'TC-initial',gpp_string:'GPP-initial',user_id:'example-user',updated:'2026-01-01T00:00:00Z',extraFlag:true};
      if(fixtureOptions.status) window.choice=fixtureOptions.status;
      window.listeners={};window.reads=0;window.writes=0;
      window.config={regulation:{name:choice.regulation},widgets:{widget:{bundleUrl:'https://example.com/widget.js'}}};
      window.didomiState={didomiVendorsEnabled:['projection-only'],didomiPurposesEnabled:[]};
      window.Didomi={
        getConfig:()=>config,
        getCurrentUserStatus:()=>{reads++;return choice},
        getPurposeById:id=>({name:id==='iab:1'?'Storage purpose':id==='c:1'?'Custom purpose':undefined,namespace:id==='iab:1'?'iab':'custom'}),
        getVendorById:id=>({name:'Example Vendor',namespace:'custom'}),
        shouldUserStatusBeCollected:()=>fixtureOptions.collect ?? true,
        on:(event,callback)=>{(listeners[event]||=[]).push(callback)},
        widgets:{show(){writes++},hide(){writes++},isVisible:()=>false},
        reset(){writes++},setCurrentUserStatus(){writes++},setUserAgreeToAll(){writes++},setUserDisagreeToAll(){writes++}
      };
      if(fixtureOptions.missingAPI) delete Didomi.getCurrentUserStatus;
      if(fixtureOptions.missingProjection) delete window.didomiState;
      (window.didomiOnReady||[]).forEach(callback=>callback());
    `,
    }),
  );
  await page.goto("/index.html?apiKey=key&flow_id=flow#test");
  await expect(page.locator("#status")).toContainText("SDK ready");
  await page.locator("#consent-state-title").click();
  if (!options.missingAPI) {
    await expect(page.locator("#consent-state-status")).toContainText(
      "Snapshot read at",
    );
    // Finish initialization and cancel the shared delayed follow-up reads.
    await page.locator("#refresh-consent-state").click();
    await expect(page.locator("#copy-consent-state")).toBeEnabled();
  }
}

test("inspector shows effective states and a separate projection, copies exact data and never writes consent", async ({
  page,
}) => {
  await fixture(page);
  const purposes = page.locator("#consent-state-purposes");
  await expect(purposes).toContainText("Storage purpose");
  await expect(purposes).toContainText("Custom purpose");
  await expect(purposes).toContainText("Disabled");
  await expect(purposes).toContainText("Unknown");
  await expect(page.locator("#consent-state-purposes-status")).toContainText(
    "1 enabled · 1 disabled · 1 unknown",
  );
  await expect(page.locator("#consent-state-interpretation")).toContainText(
    "still requests consent collection",
  );
  await expect(page.locator("#consent-projection-status")).toContainText(
    "tag-manager projection can differ",
  );
  const raw = JSON.parse(
    await page.locator("#consent-state-raw").textContent(),
  );
  expect(raw.user_id).toBe("example-user");
  expect(raw.extraFlag).toBe(true);
  expect(raw.consent_string).toBe(
    await page.locator("#tc-string").inputValue(),
  );
  await page.evaluate(() =>
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async (text) => {
          window.copiedConsent = text;
        },
      },
    }),
  );
  const reads = await page.evaluate(() => window.reads);
  await page.locator("#copy-consent-state").click();
  const copied = await page.evaluate(() => JSON.parse(window.copiedConsent));
  expect(copied.sdkStatus).toEqual(raw);
  expect(copied.tagManager.value.didomiVendorsEnabled).toEqual([
    "projection-only",
  ]);
  expect(copied.tagManager.capturedAt).toBe(copied.capturedAt);
  expect(await page.evaluate(() => window.reads)).toBe(reads);
  expect(await page.evaluate(() => window.writes)).toBe(0);
  expect(page.url()).not.toContain("example-user");
});

test("choices and stored status share one reader with strings; stale and failed reads cannot overwrite current state", async ({
  page,
}) => {
  await fixture(page, { collect: false });
  await expect(page.locator("#consent-state-interpretation")).toContainText(
    "does not prove an explicit or saved choice",
  );
  await page.evaluate(() => {
    Didomi.getCurrentUserStatus = () =>
      new Promise((resolve) => {
        window.oldRead = resolve;
      });
  });
  await page.locator("#refresh-consent-state").click();
  await expect(page.locator("#consent-state-status")).toContainText("stale");
  await expect(page.locator("#copy-consent-state")).toBeDisabled();
  await page.evaluate(() => {
    choice = {
      ...choice,
      purposes: { partial: { id: "partial", enabled: false } },
      consent_string: "TC-chosen",
      gpp_string: "GPP-chosen",
    };
    Didomi.getCurrentUserStatus = () => choice;
    didomiState = { didomiPurposesEnabled: ["new-projection"] };
    listeners["consent.changed"].forEach((callback) => callback());
  });
  await expect(page.locator("#consent-state-purposes")).toContainText(
    "partial",
  );
  await expect(page.locator("#tc-string")).toHaveValue("TC-chosen");
  await page.evaluate(() =>
    oldRead({ purposes: { old: { enabled: true } }, consent_string: "old" }),
  );
  await expect(page.locator("#consent-state-raw")).not.toContainText('"old"');
  await page.locator("#refresh-consent-state").click();
  await page.evaluate(() => {
    Didomi.getCurrentUserStatus = () =>
      Promise.reject(new Error("Status unavailable"));
  });
  await page.locator("#refresh-consent-state").click();
  await expect(page.locator("#consent-state-status")).toContainText(
    "Status unavailable",
  );
  await expect(page.locator("#consent-state-purposes tr")).toHaveCount(0);
  await expect(page.locator("#consent-state-raw")).not.toContainText(
    "TC-chosen",
  );
  await expect(page.locator("#copy-consent-state")).toBeDisabled();
  await expect(page.locator("#tc-string")).toHaveValue("");
  await page.evaluate(() => {
    Didomi.getCurrentUserStatus = () => choice;
  });
  await page.locator("#refresh-consent-state").click();
  await expect(page.locator("#consent-state-raw")).toContainText("TC-chosen");
  expect(await page.evaluate(() => writes)).toBe(0);
});

test("missing APIs, timeouts and malformed responses clear snapshots and allow appropriate retry", async ({
  page,
}) => {
  await fixture(page, { missingAPI: true, missingProjection: true });
  await expect(page.locator("#consent-state-status")).toContainText(
    "does not expose getCurrentUserStatus",
  );
  await expect(page.locator("#refresh-consent-state")).toBeDisabled();
  await page.evaluate(() => {
    Didomi.getCurrentUserStatus = () => ({
      regulation: "none",
      purposes: { essential: { enabled: true } },
      vendors: {},
    });
    didomiOnReady.forEach((callback) => callback());
  });
  await expect(page.locator("#consent-state-status")).toContainText(
    "Snapshot read at",
  );
  await expect(page.locator("#consent-state-interpretation")).toContainText(
    "regulation=none",
  );
  await expect(page.locator("#consent-projection-status")).toContainText(
    "not present",
  );
  await page.locator("#refresh-consent-state").click();
  await page.evaluate(() => {
    Didomi.getCurrentUserStatus = () => null;
  });
  await page.locator("#refresh-consent-state").click();
  await expect(page.locator("#consent-state-status")).toContainText(
    "no valid user-status object",
  );
  await page.clock.install();
  await page.evaluate(() => {
    Didomi.getCurrentUserStatus = () => new Promise(() => {});
  });
  await page.locator("#refresh-consent-state").click();
  await page.clock.fastForward(5100);
  await expect(page.locator("#consent-state-status")).toContainText(
    "did not respond in time",
  );
  await expect(page.locator("#refresh-consent-state")).toBeEnabled();
});

test("empty opt-out maps and unknown flags stay distinct from explicit choices", async ({
  page,
}) => {
  await fixture(page, {
    status: {
      regulation: "cpra",
      purposes: {},
      vendors: {},
      gpp_string: "GPP-default",
    },
    collect: true,
  });
  await expect(page.locator("#consent-state-purposes-status")).toContainText(
    "No purpose entries were returned",
  );
  await expect(page.locator("#consent-state-vendors-status")).toContainText(
    "empty map does not establish agreement",
  );
  await expect(page.locator("#consent-state-interpretation")).toContainText(
    "initial/default states",
  );
  await expect(page.locator("#gpp-string")).toHaveValue("GPP-default");
  await page.evaluate(() => {
    choice = {
      regulation: "none",
      purposes: { essential: { enabled: true } },
      bot: true,
    };
    delete Didomi.shouldUserStatusBeCollected;
  });
  await page.locator("#refresh-consent-state").click();
  await expect(page.locator("#consent-state-interpretation")).toContainText(
    "consent collection is unavailable",
  );
  await expect(page.locator("#consent-state-vendors-status")).toContainText(
    "not returned",
  );
  await expect(page.locator("#consent-state-raw")).toContainText('"bot": true');
});

test("large lists are paged and filterable; raw/copy preserve snapshots and unsafe values render as text", async ({
  page,
}) => {
  await fixture(page);
  await page.evaluate(() => {
    window.getterCalls = 0;
    choice.purposes = Object.fromEntries(
      Array.from({ length: 250 }, (_, i) => [
        "c:" + i,
        { id: "c:" + i, enabled: i % 2 === 0 },
      ]),
    );
    choice.purposes["c:0"].label = '<img src=x onerror="window.injected=true">';
    choice.circular = choice;
    Object.defineProperty(choice, "unsafe", {
      enumerable: true,
      get() {
        getterCalls++;
        throw Error();
      },
    });
    choice.toJSON = () => {
      getterCalls++;
      throw Error();
    };
    didomiState = {};
    Object.defineProperty(didomiState, "unsafe", {
      enumerable: true,
      get() {
        getterCalls++;
        return true;
      },
    });
  });
  await page.locator("#refresh-consent-state").click();
  await expect(page.locator("#consent-state-purposes tr")).toHaveCount(100);
  await page.locator("#more-consent-purposes").click();
  await expect(page.locator("#consent-state-purposes tr")).toHaveCount(200);
  await page.locator("#consent-state-filter").fill("c:249");
  await expect(page.locator("#consent-state-purposes tr")).toHaveCount(1);
  await expect(page.locator("#consent-state-raw")).toContainText('"c:0"');
  await expect(page.locator("#consent-state-raw")).toContainText(
    "Accessor not read",
  );
  expect(await page.locator("#consent-state img").count()).toBe(0);
  expect(await page.evaluate(() => getterCalls)).toBe(0);
  expect(await page.evaluate(() => window.injected)).toBeUndefined();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
