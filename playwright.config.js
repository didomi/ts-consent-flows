const { defineConfig } = require("@playwright/test");
module.exports = defineConfig({
  workers: 1,
  testDir: "./tests",
  testMatch: "flows.browser.test.js",
  use: { headless: true, baseURL: "http://127.0.0.1:4173" },
  webServer: {
    command: "npm start",
    url: "http://127.0.0.1:4173/index.html",
    reuseExistingServer: !process.env.CI,
  },
});
