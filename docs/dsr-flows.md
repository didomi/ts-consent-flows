# Subject Request Flows

The sandbox uses one repository and two product entry points. Consent Flows
remain the default. `flow_type=dsr` selects Subject Request Flows (DSR),
independently of a regulation name such as GDPR.

## Current foundation

DSR mode currently shows a preparation screen across the existing Setup, Test,
Configuration and Troubleshoot tabs. It does not load either product SDK,
request configuration, install consent API stubs or initialize consent
diagnostics. It does not display or submit a request form.

Switching products navigates to a fresh document at the same deployment and
path. Only `apiKey`, `environment` and `sdk_environment` carry over. Flow IDs,
geographic settings, arbitrary JSON, user identities, widget/layer selections
and SDK pins do not transfer. Existing Consent Flow URLs and their configuration
behavior remain supported. Unsupported product types show an error without
starting an SDK.

Product-specific runtime and validation logic should stay separate. Share
navigation, viewers, presentation and URL utilities only where their behavior
matches. DSR must not inherit CMP readiness queues, reset actions, consent
strings, GCM or TCF/GPP tools.

## Follow-up delivery

1. Foundation: explicit product selection, document isolation and URL compatibility.
2. DSR runtime: loading, widget controls, configuration and routing/asset diagnostics.
3. Release validation: broader cross-product browser regressions, documentation,
   screenshots and a recording. Focused tests belong in each preceding change.
4. Optional follow-up: richer submission diagnostics and verified mock submission
   support if they require additional SDK capabilities.

Before enabling an interactive DSR form, define and test its submission behavior.
A published form can create a real subject request. A submission-free mode must
actually prevent requests and must not present a blocked or mocked action as a
successful backend submission. Use dedicated test data for any explicitly enabled
real submission tests. Do not include personal form values in share links or
diagnostic exports by default.

## One cumulative deploy preview

Keep the DSR integration PR open from `codex/dsr-flow-sandbox` into `main`.
Create subsequent review branches from that integration branch and target their
PRs back to `codex/dsr-flow-sandbox`. Merge each reviewed change into the
integration branch to update its Netlify deploy preview. The feature reaches
production only when the integration PR is merged into `main`.

Netlify previews represent the head branch of a PR. Opening a child PR alone
does not add its commits to the integration preview. A child PR may have a
separate preview, but the integration PR's preview is the cumulative test URL
after child changes merge into it. Keep later branches current with the
integration branch to avoid mixing unrelated changes or retesting an older base.

Use the preview URL reported by Netlify after the integration PR is opened;
do not assume a PR number or deployment URL in advance.
