// Each preview gets a new nonce. The SDK propagates app.nonce to its inline
// module-import wrapper; arbitrary inline scripts remain disallowed.
export function dsrFrameDocument(runnerURL) {
  const nonce = Array.from(crypto.getRandomValues(new Uint8Array(24)), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  const src = new URL(runnerURL).href
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src https: 'nonce-${nonce}'; style-src https: 'unsafe-inline'; img-src https: data:; font-src https: data:; connect-src 'none'; form-action 'none'; frame-src 'none'; base-uri 'none'">
  <title>DSR form preview</title><script nonce="${nonce}" src="${src}" defer></script></head><body></body></html>`;
}
