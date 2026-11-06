const objectMap = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);

// Copy data properties without executing getters/toJSON or retaining SDK objects.
// Bounds protect the diagnostic view; they never change the underlying state.
export function captureConsentData(value) {
  const seen = new WeakSet();
  const notes = new Set();
  let nodes = 100000;
  let characters = 2000000;
  function copy(item, depth) {
    if (--nodes < 0 || depth > 16 || characters <= 0) {
      notes.add(
        "Snapshot limits reached; some values were omitted or truncated.",
      );
      return "[Truncated]";
    }
    if (item === null || typeof item === "boolean") return item;
    if (typeof item === "number" && Number.isFinite(item)) return item;
    if (typeof item === "string") {
      const limit = Math.min(characters, 20000);
      characters -= Math.min(item.length, limit);
      if (item.length > limit) {
        notes.add(
          "Snapshot limits reached; some values were omitted or truncated.",
        );
        return item.slice(0, limit) + " [Truncated]";
      }
      return item;
    }
    if (typeof item !== "object") return `[${typeof item}]`;
    if (seen.has(item)) {
      notes.add("Circular or repeated references are marked in the snapshot.");
      return "[Circular or repeated reference]";
    }
    seen.add(item);
    try {
      const descriptors = Object.getOwnPropertyDescriptors(item);
      const keys = Object.keys(descriptors).filter(
        (key) => descriptors[key].enumerable,
      );
      const result = Array.isArray(item) ? [] : Object.create(null);
      for (const key of keys.slice(0, 10000)) {
        if (nodes <= 0 || characters <= 0) {
          notes.add(
            "Snapshot limits reached; some values were omitted or truncated.",
          );
          break;
        }
        characters -= key.length;
        const descriptor = descriptors[key];
        if ("value" in descriptor)
          result[key] = copy(descriptor.value, depth + 1);
        else {
          result[key] = "[Accessor not read]";
          notes.add("Accessors were not evaluated.");
        }
      }
      if (keys.length > 10000)
        notes.add(
          "Snapshot limits reached; some values were omitted or truncated.",
        );
      return result;
    } catch {
      notes.add("Some values could not be inspected.");
      return "[Unreadable value]";
    }
  }
  return { value: copy(value, 0), notes: [...notes] };
}

export function consentRows(value, metadata = new Map()) {
  if (!objectMap(value)) return [];
  return Object.entries(value).map(([id, entry]) => {
    const enabled = objectMap(entry) ? entry.enabled : undefined;
    const detail = metadata.get(id);
    return {
      id,
      name: typeof detail?.name === "string" ? detail.name : "Name unavailable",
      namespace:
        typeof detail?.namespace === "string"
          ? detail.namespace
          : "Not returned",
      state:
        enabled === true
          ? "Enabled"
          : enabled === false
            ? "Disabled"
            : "Unknown",
      detail: JSON.stringify(entry),
    };
  });
}

export function describeConsentCollection(value, rows, kind) {
  if (!objectMap(value))
    return `${kind} status map was not returned or has an unsupported shape. Missing values are unknown.`;
  if (!rows.length)
    return `No ${kind.toLowerCase()} entries were returned. An empty map does not establish agreement or rejection.`;
  const count = (state) => rows.filter((row) => row.state === state).length;
  return `${rows.length} ${kind.toLowerCase()} entries: ${count("Enabled")} enabled · ${count("Disabled")} disabled · ${count("Unknown")} unknown.`;
}

export function consentInterpretation(status, shouldCollect) {
  const notes = [
    "Enabled/disabled describe the SDK's effective state, not proof of an explicit agreement. Defaults, essential purposes, bot exemptions and regulation=none can enable entries without a user choice.",
  ];
  if (shouldCollect === true)
    notes.push(
      "The SDK still requests consent collection. Returned values may be initial/default states.",
    );
  else if (shouldCollect === false)
    notes.push(
      "The SDK does not request consent collection. This alone does not prove an explicit or saved choice.",
    );
  else
    notes.push("Whether the SDK requests consent collection is unavailable.");
  if (status?.regulation === "none")
    notes.push(
      "The SDK reports regulation=none; enabled entries must not be presented as an explicit acceptance.",
    );
  notes.push(
    "This snapshot may differ from unsaved choices in an open widget. TC/GPP and stored DCS remain in Consent strings.",
  );
  return notes.join(" ");
}

// Public lookup methods read already-loaded metadata; never strip or translate IDs.
export function consentMetadata(status, sdk, config) {
  const result = {};
  for (const kind of ["purposes", "vendors"]) {
    const method = kind === "purposes" ? "getPurposeById" : "getVendorById";
    const fallback = config?.app?.[kind]?.custom;
    const names = new Map();
    for (const id of Object.keys(
      objectMap(status?.[kind]) ? status[kind] : {},
    )) {
      let entry;
      try {
        if (typeof sdk?.[method] === "function") entry = sdk[method](id);
      } catch {
        /* Keep the ID when optional metadata is unavailable. */
      }
      if (!entry) {
        entry = Array.isArray(fallback)
          ? fallback.find((item) => String(item?.id) === id)
          : objectMap(fallback) && Object.hasOwn(fallback, id)
            ? fallback[id]
            : undefined;
      }
      if (objectMap(entry)) {
        try {
          const descriptors = Object.getOwnPropertyDescriptors(entry);
          names.set(id, {
            name: descriptors.name?.value,
            namespace: descriptors.namespace?.value,
          });
        } catch {
          /* Optional metadata must not prevent status inspection. */
        }
      }
    }
    result[kind] = names;
  }
  return result;
}
