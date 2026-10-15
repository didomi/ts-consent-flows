# Consent Flows Configuration Debugger

The website https://didomi.github.io/ts-consent-flows enables you to test, share, and troubleshoot Didomi Consent Flows configurations.

## Consent Notices

Open the [CMP notice sandbox](https://didomi.github.io/ts-all-cmp/) to test Consent Notices. Its source and tests are maintained separately in [ts-all-cmp](https://github.com/didomi/ts-all-cmp).

## 🔧 How to Use

1. Open the page with appropriate query parameters in the URL (e.g. `?apiKey=...&flow_id=...`).
2. Modify the inputs or JSON config in the UI, then click **Apply and reload**.
3. The URL will update automatically — you can copy and share it.

## 🌐 Supported Query Parameters

| Parameter                                     | Description                                                                                 |
| --------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `apiKey`                                      | Public API key used for the Didomi SDK                                                      |
| `flow_id`                                     | ID of the published Flow to load                                                            |
| `environment`                                 | Flow deployment environment: `production` (default) or `staging`                            |
| `sdk_environment`                             | SDK environment: `production` (default), `staging`, or `preprod`                            |
| `platform`                                    | Platform of the published Flow: `web` (default) or `ctv`                                    |
| `ctv_ui`                                      | If set to `1`, forces the SDK's CTV UI for this test                                        |
| `country`                                     | User's country code (e.g., `FR`, `US`)                                                      |
| `region`                                      | User's region code (e.g., `CA` for California); requires `country`                          |
| `regulation`                                  | Regulation to request from the published Flow (e.g., `gdpr`, `cpra`)                        |
| `lang`                                        | Requested configuration language (e.g., `fr`, `en-US`); does not force the display language |
| `brand`                                       | Brand configuration ID to use for this test                                                 |
| `brand_version`                               | Brand version ID; requires `brand`                                                          |
| `opts`                                        | Set to `gvl` to explicitly include IAB Global Vendor List data in the loader                |
| `ts`                                          | CDN cache-key value; change it to bypass an existing cached response                        |
| `commit_hash`                                 | Full 40-character SDK Git commit hash or `latest`; a published SDK pin can take priority    |
| `didomiConfig`                                | Native SDK URL JSON object, limited to the supported SDK URL overrides below                |
| `didomiConfig.notice.enable`                  | Set to `true` or `false` to allow or disable automatic notice display                       |
| `didomiConfig.notice.showDataProcessing`      | Set to `true` or `false` to show or hide data-processing purposes in supported notices      |
| `didomiConfig.experiment.group`               | Experiment group to use for this test                                                       |
| `didomiConfig.app.vendors.iab.version`        | IAB TCF major version override (e.g., `2`)                                                  |
| `didomiConfig.app.alwaysDisplayActionButtons` | Set to `true` or `false` to control persistent action buttons in supported notices          |
| `didomiConfig.user.externalConsent.value`     | External consent value, when supported by the loaded configuration                          |
| `didomiConfig.sync.enabled`                   | Set to `true` or `false` to control consent synchronization                                 |
| `didomi_country`                              | Runtime country override for widget rules; does not change the downloaded configuration     |
| `didomi_region`                               | Runtime region override for widget rules; does not change the downloaded configuration      |
| `organization_user_id`                        | Test visitor ID for rules and configured identity or synchronization behavior               |
| `age`                                         | Test visitor age for display rules                                                          |
| `page_category`                               | Page category for display rules                                                             |
| `attributes`                                  | JSON object containing test visitor attributes for display rules                            |
| `gpp_stub`                                    | If set to `1`, enables the GPP stub before SDK startup                                      |
| `config`                                      | Base64-encoded JSON used for the `didomiConfig`                                             |
| `apply_conf`                                  | If set to `1`, applies the decoded `didomiConfig` on page load                              |
| `widget_id`                                   | Widget ID used by the Show widget action; omitted to let Flow rules select the widget       |
| `layer_name`                                  | Layer name used by the Show widget action                                                   |

## 📦 Example

```
https://didomi.github.io/ts-consent-flows/?apiKey=YOUR_PUBLIC_KEY&flow_id=YOUR_FLOW_ID
```

## Repository layout

- `index.html`: sandbox page and styles.
- `scripts/flows.js`: page setup, SDK startup, and widget controls.
- `scripts/flows-*.mjs`: state, configuration viewer, diagnostics, consent strings, and path testing.
- `scripts/sdk.js` and `scripts/gpp_stub.js`: SDK startup and consent API stubs.
- `docs/flows.md`: usage and troubleshooting reference.
- `tests/`: unit and browser checks using a mocked SDK.
- `playwright.config.js`: browser tests and the local test server.
