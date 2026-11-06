const { test, expect } = require("@playwright/test");

test("invalid DSR links start no SDK or consent diagnostics, even with CMP overrides", async ({
  page,
}) => {
  const requests = [];
  page.on("request", (request) => requests.push(request.url()));
  await page.goto(
    "/index.html?flow_type=dsr&apiKey=public-key&flow_id=dsr-flow&gpp_stub=1&commit_hash=latest&ctv_ui=1&apply_conf=1&config=invalid#test",
  );
  await expect(page.locator("#status")).toContainText(
    "public API key must be a UUID",
  );
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Test your Subject Request Flows",
  );
  await expect(page.locator("#tab-test")).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(page.getByRole("tab")).toHaveCount(4);
  for (const id of [
    "consent-state",
    "consent-strings",
    "framework-diagnostics",
    "data-layer-diagnostics",
    "flow-form",
    "reset-status-setup",
  ])
    await expect(page.locator(`#${id}`)).toHaveCount(0);
  expect(
    await page.evaluate(() =>
      [
        window.Didomi,
        window.DidomiDSR,
        window.didomiConfig,
        window.didomiOnReady,
        window.__tcfapi,
        window.__gpp,
        window.flowDataLayerCapture,
        window.flowDebugCapture,
      ].every((value) => value === undefined),
    ),
  ).toBe(true);
  expect(
    requests.some((url) =>
      /loader\.js|gpp_stub\.js|\/sdk\.js|\/flows\.js|\/flows-(consent|framework|checks|data-layer\.mjs)/.test(
        url,
      ),
    ),
  ).toBe(false);
  await page.getByRole("tab", { name: "3. Configuration" }).click();
  await expect(page.locator("#config-panel")).toContainText(
    "No DSR configuration has been requested",
  );
  await page.locator("#tab-config").press("ArrowRight");
  await expect(page.locator("#troubleshoot-panel")).toBeVisible();
  await page.reload();
  await expect(page.locator("#status")).toContainText(
    "public API key must be a UUID",
  );
});

test("changing products navigates to a fresh document and removes previous SDK globals and settings", async ({
  page,
}) => {
  await page.route("https://sdk*/**", (route) =>
    route.fulfill({
      contentType: "application/javascript",
      body: `window.Didomi = { getConfig: () => ({widgets:{widget:{bundleUrl:'https://example.com/widget.js'}}}), widgets: { isVisible: () => false } }; (window.didomiOnReady || []).forEach(callback => callback());`,
    }),
  );
  await page.goto(
    "/index.html?apiKey=public-key&flow_id=consent-flow&environment=staging&sdk_environment=staging&gpp_stub=1&commit_hash=latest#test",
  );
  await expect(page.locator("#status")).toContainText("SDK ready");
  expect(await page.evaluate(() => typeof window.__tcfapi)).toBe("function");
  await page.getByLabel("Flow type", { exact: true }).selectOption("dsr");
  await expect(page.locator("#dsr-form")).toBeVisible();
  await expect(page.locator("#dsr-preview")).toHaveCount(0);
  expect(new URL(page.url()).search).toBe(
    "?apiKey=public-key&environment=staging&sdk_environment=staging&flow_type=dsr",
  );
  expect(
    await page.evaluate(() =>
      [
        window.Didomi,
        window.__tcfapi,
        window.__gpp,
        window.didomiOnReady,
      ].every((value) => value === undefined),
    ),
  ).toBe(true);
  await page.getByLabel("Flow type", { exact: true }).selectOption("consent");
  await expect(page.locator("#apiKey")).toHaveValue("public-key");
  await expect(page.locator("#flow_id")).toHaveValue("");
  await expect(page.locator("#spcloader")).toHaveCount(0);
  expect(new URL(page.url()).searchParams.has("flow_type")).toBe(false);
});

test("unknown product links fail closed and can be corrected with the selector", async ({
  page,
}) => {
  await page.goto(
    "/index.html?flow_type=unknown&apiKey=public-key&flow_id=flow",
  );
  await expect(page.locator("#status")).toContainText("Unsupported Flow type");
  await expect(page.locator("#flow-type")).toHaveValue("unknown");
  await expect(page.locator("#spcloader")).toHaveCount(0);
  expect(
    await page.evaluate(() =>
      [
        window.didomiOnReady,
        window.flowDataLayerCapture,
        window.__tcfapi,
      ].every((value) => value === undefined),
    ),
  ).toBe(true);
  await page.getByLabel("Flow type", { exact: true }).selectOption("consent");
  await expect(page.locator("#flow_id")).toHaveValue("");
  await expect(page.locator("#status")).toContainText("Enter both");
});
