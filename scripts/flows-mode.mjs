// Product selection is explicit; a regulation such as GDPR can apply to either product.
export function readFlowType(params) {
  const type = params.get("flow_type") || "consent";
  if (type !== "consent" && type !== "dsr")
    throw new Error(
      "Unsupported Flow type. Choose Consent Flows or Subject Request Flows (DSR).",
    );
  return type;
}

export function flowTypeURL(type, href) {
  readFlowType(new URLSearchParams({ flow_type: type }));
  const url = new URL(href);
  const previous = new URLSearchParams(url.search);
  // Do not transfer Flow IDs, arbitrary JSON, user identities, framework stubs,
  // widget selections or SDK pins between products.
  url.search = "";
  for (const key of ["apiKey", "environment", "sdk_environment"]) {
    if (previous.has(key)) url.searchParams.set(key, previous.get(key));
  }
  if (type === "dsr") url.searchParams.set("flow_type", "dsr");
  url.hash = "setup";
  return url;
}
