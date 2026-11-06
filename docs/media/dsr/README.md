# DSR preview demonstration

- `foundation.png`: product selector and preparation screen from the foundation PR.
- `preview-desktop.png`: published DSR form rendered in the isolated desktop preview.
- `preview-mobile.png`: mobile preview after an intentionally blocked submission.
- `preview-walkthrough.webm`: loading the form, Show/Hide controls, filling synthetic
  data and observing the submission-blocked result.

These captures omit setup credentials, Flow/widget IDs and raw configuration.
The email address uses the reserved `.invalid` domain. No subject request was
created during capture. Submission is blocked rather than mocked as successful;
the widget's own error message after submitting is expected in this mode.

The images and recording are demonstration assets, not evidence that backend
request creation, email delivery or request administration have been tested.
