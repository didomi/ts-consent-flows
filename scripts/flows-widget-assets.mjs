const isObject = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const validURL = (value) => {
  try {
    return (
      typeof value === "string" &&
      ["http:", "https:"].includes(new URL(value).protocol)
    );
  } catch {
    return false;
  }
};

// Mirrors the SDK's widget-bundle.js: exact SDK locale, then widget default.
// When the running locale/build is unknown, report published candidates rather
// than assuming the loader's lang parameter or the requested platform is it.
export function inspectWidgetAssets(definition, context = {}) {
  const issues = [];
  const result = {
    format: "legacy",
    language: null,
    sdkBuild: context.sdkBuild || null,
    availableLanguages: [],
    candidates: [],
    loadable: false,
    issues,
  };
  if (!isObject(definition)) return result;
  if (!Object.hasOwn(definition, "artifacts")) {
    const url =
      Array.isArray(definition.bundleUrls) && definition.bundleUrls.length
        ? definition.bundleUrls[0]
        : definition.bundleUrl;
    result.candidates.push({ url });
    result.loadable = validURL(url);
    if (!url)
      issues.push({
        code: "missing",
        detail: "No published web display asset URL was returned.",
      });
    else if (!result.loadable)
      issues.push({
        code: "invalid",
        detail: "The legacy bundle URL is not an absolute HTTP(S) URL.",
      });
    else
      issues.push({
        code: "old-format",
        detail:
          "Only bundleUrl / bundleUrls are present. Current SDK builds read artifacts.web instead; these fields apply to older SDK builds.",
      });
    return result;
  }

  result.format = "artifacts.web";
  const web = definition.artifacts?.web;
  if (!isObject(web)) {
    issues.push({
      code: "missing",
      detail:
        "artifacts.web is missing or is not a language map. Native layout artifacts do not supply a web bundle.",
    });
    return result;
  }
  result.availableLanguages = Object.keys(web);
  const language =
    context.language && web[context.language]
      ? context.language
      : definition.defaultLanguage && web[definition.defaultLanguage]
        ? definition.defaultLanguage
        : null;
  // Without an observed SDK locale, a non-default language may still render.
  const languages = context.language
    ? language
      ? [language]
      : []
    : result.availableLanguages;
  result.language = context.language ? language : null;
  if (!languages.length) {
    issues.push({
      code: "missing",
      detail: context.language
        ? `No artifacts.web entry matches SDK language ${context.language} or widget defaultLanguage ${definition.defaultLanguage || "(missing)"}.`
        : "artifacts.web has no published languages.",
    });
    return result;
  }
  for (const lang of languages) {
    const entry = web[lang];
    const candidate = {
      language: lang,
      modernUrl: entry?.modern ?? null,
      legacyUrl: entry?.legacy?.url ?? null,
      legacyGlobalName: entry?.legacy?.globalName ?? null,
    };
    result.candidates.push(candidate);
    // loadWidget checks the modern URL even on the legacy SDK build.
    if (!candidate.modernUrl) {
      issues.push({
        code: "missing",
        detail: `artifacts.web[${JSON.stringify(lang)}].modern is missing.`,
      });
      continue;
    }
    if (!validURL(candidate.modernUrl)) {
      issues.push({
        code: "invalid",
        detail: `artifacts.web[${JSON.stringify(lang)}].modern is not an absolute HTTP(S) URL.`,
      });
      continue;
    }
    if (context.sdkBuild === "legacy") {
      if (
        !validURL(candidate.legacyUrl) ||
        typeof candidate.legacyGlobalName !== "string" ||
        !candidate.legacyGlobalName.trim()
      ) {
        issues.push({
          code: "legacy",
          detail: `artifacts.web[${JSON.stringify(lang)}].legacy needs an absolute HTTP(S) url and a globalName for the running legacy SDK.`,
        });
        continue;
      }
    }
    result.loadable = true;
  }
  return result;
}
