# Consent Flows sandbox

Sandbox for testing and troubleshooting Didomi Consent Flows for Web and web-based CTV.

Load a published Flow with a public API key and Flow ID, test delivery and runtime overrides, inspect its configuration, exercise widget controls, and investigate captured SDK errors. Test settings can be shared as a URL.

## Run locally

Requires Node.js 18 or newer and Python 3.

```sh
npm ci
npm start
```

Open <http://127.0.0.1:4173/> and enter a **public** API key and a published Flow ID. Example:

```text
http://127.0.0.1:4173/?apiKey=YOUR_PUBLIC_KEY&flow_id=YOUR_FLOW_ID
```

The site is static: deploy the repository root to any static host, with `index.html` as the entry point. No build step is required.

See [setup, query parameters, and troubleshooting](docs/flows.md) for the full guide. Share links include entered values; use test identities and avoid putting private credentials or customer personal data in settings or custom JSON.

## Repository layout

- `index.html`: sandbox page and styles.
- `scripts/flows.js`: page setup, SDK startup, and widget controls.
- `scripts/flows-*.mjs`: state, configuration viewer, diagnostics, consent strings, and path testing.
- `scripts/sdk.js` and `scripts/gpp_stub.js`: SDK startup and consent API stubs.
- `docs/flows.md`: usage and troubleshooting reference.
- `tests/`: unit and browser checks using a mocked SDK.
- `playwright.config.js`: browser tests and the local test server.

## Tests

```sh
npx playwright install chromium
npm test
```

`npm run test:unit` and `npm run test:browser` run the suites separately. Browser tests start their own local server. They intercept SDK requests and require no API credentials or published Flow.

## Legacy Consent Notices

The [legacy notice sandbox](https://didomi.github.io/ts-all-cmp/) remains in [ts-all-cmp](https://github.com/didomi/ts-all-cmp).

This repository extracts the Flows sandbox introduced in [ts-all-cmp commit d008df6](https://github.com/didomi/ts-all-cmp/commit/d008df6fd7c6e3d727c4b711bb0f595eddca9965), including its subsequent formatting changes. The existing MIT license is preserved.
