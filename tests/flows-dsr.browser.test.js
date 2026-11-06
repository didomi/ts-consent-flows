const { test, expect } = require("@playwright/test");
const query =
  "flow_type=dsr&apiKey=00000000-0000-4000-8000-000000000000&flow_id=example-flow&environment=staging&sdk_environment=staging";
const config = {
  app: { apiKey: "test" },
  flowId: "example-flow",
  environmentId: "env",
  configId: "config",
  regulation: { regulationConfigId: "reg" },
  defaultWidgetId: "widget",
  rules: [],
  widgets: {
    widget: {
      defaultLanguage: "en",
      artifacts: { web: { en: { modern: "https://example.com/widget.js" } } },
    },
  },
};
async function mockDSR(page, value = config) {
  await page.route("https://sdk*/dsr/**/loader.js*", (route) =>
    route.fulfill({
      contentType: "application/javascript",
      body: `
 let visible=true;
 const host=document.createElement('div');host.id='didomi-dsr-host';
 const form=document.createElement('form');form.innerHTML='<label>Test identifier<input name="identifier" /></label><button type="button">Submit test request</button>';
 form.querySelector('button').onclick=()=>fetch('https://requests.example.test/dsr/requests',{method:'POST',body:form.querySelector('input').value}).catch(()=>{});
 host.append(form);document.body.append(host);
 window.DidomiDSR={getConfig:()=>(${JSON.stringify(value)}),widgets:{show:(options)=>{visible=true;host.hidden=false;window.lastShow=options},hide:()=>{visible=false;host.hidden=true},isVisible:()=>visible}};
 `,
    }),
  );
}
test("DSR renders in an isolated frame, reads config, and controls the widget without CMP APIs", async ({
  page,
}) => {
  await mockDSR(page);
  await page.goto("/index.html?" + query + "#test");
  await expect(page.locator("#status")).toContainText("DSR SDK ready");
  const frame = page.frameLocator("#dsr-preview");
  await expect(
    frame.getByRole("button", { name: "Submit test request" }),
  ).toBeVisible();
  await expect(page.locator("#dsr-preview")).toHaveAttribute(
    "sandbox",
    "allow-scripts",
  );
  expect(
    await frame.locator("body").evaluate(() => {
      try {
        parent.document.body;
        return false;
      } catch {
        return true;
      }
    }),
  ).toBe(true);
  expect(
    await page.evaluate(() =>
      [
        window.Didomi,
        window.DidomiDSR,
        window.__tcfapi,
        window.__gpp,
        window.didomiOnReady,
        window.flowDataLayerCapture,
      ].every((v) => v === undefined),
    ),
  ).toBe(true);
  await page.locator("#hide-widget").click();
  await expect(frame.locator("#didomi-dsr-host")).toBeHidden();
  await page.locator("#dsr-widget").fill("widget");
  await page.locator("#dsr-layer").fill("review");
  await page.locator("#show-widget").click();
  await expect(frame.locator("#didomi-dsr-host")).toBeVisible();
  expect(await frame.locator("body").evaluate(() => window.lastShow)).toEqual({
    widgetId: "widget",
    layerName: "review",
  });
  await page.getByRole("tab", { name: "3. Configuration" }).click();
  await expect(page.locator("#config-tree")).toContainText("flowId");
  await expect(page.locator("#dsr-findings")).toContainText(
    "No configuration issues",
  );
});
test("browser policy blocks submission and other transports without exporting form values", async ({
  page,
}) => {
  await mockDSR(page);
  const outbound = [];
  await page.route("https://requests.example.test/**", (route) => {
    outbound.push(route.request().method());
    return route.fulfill({ json: { ok: true } });
  });
  await page.goto("/index.html?" + query + "#test");
  const frame = page.frameLocator("#dsr-preview");
  await frame.getByLabel("Test identifier").fill("private-test-value");
  await frame.getByRole("button", { name: "Submit test request" }).click();
  await expect(page.locator("#dsr-submission-status")).toHaveText(
    "Submission blocked by the preview. No subject request was sent.",
  );
  expect(outbound).toEqual([]);
  const results = await frame.locator("body").evaluate(async () => {
    const fetchBlocked = await fetch("https://requests.example.test/other", {
      method: "POST",
    }).then(
      () => false,
      () => true,
    );
    const xhrBlocked = await new Promise((resolve) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", "https://requests.example.test/other");
      xhr.onload = () => resolve(false);
      xhr.onerror = () => resolve(true);
      xhr.send("private-test-value");
    });
    return { fetchBlocked, xhrBlocked };
  });
  expect(results).toEqual({ fetchBlocked: true, xhrBlocked: true });
  expect(outbound).toEqual([]);
  await frame.locator("form").evaluate((form) => {
    form.action = "https://requests.example.test/dsr/requests";
    form.method = "POST";
    form.submit();
  });
  expect(outbound).toEqual([]);
  expect(await page.locator("#sandbox").innerText()).not.toContain(
    "private-test-value",
  );
  expect(page.url()).not.toContain("private-test-value");
});

test("per-frame nonce permits the SDK wrapper but arbitrary inline scripts stay blocked", async ({
  page,
}) => {
  await mockDSR(page);
  await page.goto("/index.html?" + query + "#test");
  await expect(page.locator("#status")).toContainText("DSR SDK ready");
  const frame = page.frameLocator("#dsr-preview");
  const nonce = await frame.locator("body").evaluate(() => {
    const blocked = document.createElement("script");
    blocked.textContent = "window.unapprovedInlineRan = true";
    document.head.append(blocked);
    const allowed = document.createElement("script");
    allowed.nonce = window.didomiConfig.app.nonce;
    allowed.textContent = "window.sdkWrapperRan = true";
    document.head.append(allowed);
    if (window.unapprovedInlineRan || !window.sdkWrapperRan)
      throw new Error("Unexpected inline script policy");
    return allowed.nonce;
  });
  await page.reload();
  await expect(page.locator("#status")).toContainText("DSR SDK ready");
  expect(
    await frame.locator("body").evaluate(() => window.didomiConfig.app.nonce),
  ).not.toBe(nonce);
});
test("empty setup stays usable and applying settings loads only a DSR loader", async ({
  page,
}) => {
  await mockDSR(page);
  await page.goto("/index.html?flow_type=dsr#setup");
  await expect(page.locator("#dsr-preview")).toHaveCount(0);
  await expect(page.locator("#tab-setup")).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await page
    .getByLabel("Public API key", { exact: true })
    .fill("00000000-0000-4000-8000-000000000000");
  await page.getByLabel("Flow ID", { exact: true }).fill("example-flow");
  await page.getByRole("button", { name: "Apply and reload" }).click();
  await expect(page.locator("#status")).toContainText("DSR SDK ready");
  await expect(page.locator("#tab-test")).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(page.locator("#runtime-title")).toBeFocused();
});
test("missing DSR metadata and widget assets select Troubleshoot with specific findings", async ({
  page,
}) => {
  await mockDSR(page, { widgets: { widget: {} } });
  await page.goto("/index.html?" + query + "#test");
  await expect(page.locator("#dsr-findings")).toContainText("missing flowId");
  await expect(page.locator("#dsr-findings")).toContainText(
    "no usable published web",
  );
  await expect(page.locator("#tab-troubleshoot")).toHaveAttribute(
    "aria-selected",
    "true",
  );
});
test("loader failure routes to DSR troubleshooting without pretending the SDK is ready", async ({
  page,
}) => {
  await page.route("https://sdk*/dsr/**/loader.js*", (route) => route.abort());
  await page.goto("/index.html?" + query + "#test");
  await expect(page.locator("#dsr-findings")).toContainText("could not load");
  await expect(page.locator("#tab-troubleshoot")).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(page.locator("#show-widget")).toBeDisabled();
});
