// Observe queues without creating them, emitting commands, or loading tags.
// Polling discovers late/replaced queues; push wrapping timestamps new entries.
(function () {
  if (window.flowDataLayerCapture) return;
  const entries = [];
  const watches = new Map();
  const queues = new WeakMap();
  let sequence = 0;
  let dropped = 0;
  let revision = 0;
  let polling = false;
  const changed = () => revision++;

  // Snapshot data properties only: never invoke arbitrary getters or toJSON.
  function snapshot(value) {
    const seen = new WeakSet();
    let budget = 300;
    let characters = 12000;
    function visit(item, depth) {
      if (--budget < 0 || depth > 7 || characters <= 0) return "[Truncated]";
      if (typeof item === "string") {
        const limit = Math.min(2000, characters);
        characters -= Math.min(item.length, limit);
        return item.length > limit
          ? item.slice(0, limit) + " [Truncated]"
          : item;
      }
      if (item === null || typeof item === "boolean") return item;
      if (typeof item === "number")
        return Number.isFinite(item) ? item : String(item);
      if (typeof item === "function") return "[Function]";
      if (typeof item !== "object") return String(item);
      if (seen.has(item)) return "[Circular or repeated reference]";
      seen.add(item);
      try {
        const properties = Object.getOwnPropertyDescriptors(item);
        const array =
          Array.isArray(item) ||
          (Object.hasOwn(properties, "callee") &&
            Object.hasOwn(properties, "length"));
        const result = array ? [] : Object.create(null);
        const keys = Object.keys(properties).filter(
          (key) => properties[key].enumerable,
        );
        for (const key of keys.slice(0, 60)) {
          const descriptor = properties[key];
          const next =
            "value" in descriptor
              ? visit(descriptor.value, depth + 1)
              : "[Accessor not read]";
          if (array) result.push(next);
          else {
            const name = key.slice(0, 200);
            characters -= name.length;
            result[name] = next;
          }
        }
        if (keys.length > 60) {
          if (array) result.push("[Truncated]");
          else result["[Truncated]"] = `${keys.length - 60} more properties`;
        }
        return result;
      } catch {
        return "[Unreadable value]";
      }
    }
    return visit(value, 0);
  }
  function record(state, values, source) {
    for (const value of values) {
      if (entries.length === 200) {
        entries.shift();
        dropped++;
      }
      entries.push({
        id: ++sequence,
        layers: [...state.names],
        observedAt: new Date().toISOString(),
        source,
        value,
      });
    }
    if (values.length) changed();
  }
  function mode(state, next) {
    if (state.mode !== next) {
      state.mode = next;
      changed();
    }
  }
  function scan(state) {
    const queue = state.queue;
    if (queue.length < state.cursor) state.cursor = 0;
    const start = Math.max(state.cursor, queue.length - 200);
    if (start > state.cursor) dropped += start - state.cursor;
    const values = [];
    for (let i = start; i < queue.length; i++) {
      const descriptor = Object.getOwnPropertyDescriptor(queue, String(i));
      values.push(
        snapshot(
          descriptor && "value" in descriptor
            ? descriptor.value
            : "[Entry unavailable]",
        ),
      );
    }
    state.cursor = queue.length;
    record(state, values, "pre-existing / sampled (original time unknown)");
  }
  function attach(state) {
    scan(state);
    const original = state.queue.push;
    if (original === state.wrapper) return;
    if (typeof original !== "function") {
      mode(state, "Unsupported push; sampling only");
      return;
    }
    const descriptor = Object.getOwnPropertyDescriptor(state.queue, "push");
    if (
      (descriptor && (!("value" in descriptor) || !descriptor.writable)) ||
      (!descriptor && !Object.isExtensible(state.queue))
    ) {
      mode(state, "Read-only push; sampling only");
      return;
    }
    const wrapper = function (...args) {
      // A tag manager may replace push with a function delegating to our old
      // wrapper. Record only the outer call, and never change its return/throw.
      const outer = state.depth === 0;
      let values;
      if (outer && this === state.queue) {
        try {
          values = args.slice(-200).map(snapshot);
          if (args.length > 200) dropped += args.length - 200;
        } catch {}
      }
      state.depth++;
      try {
        const result = original.apply(this, args);
        if (outer && this === state.queue) {
          try {
            state.cursor = state.queue.length;
            record(state, values || [], "push observed");
          } catch {}
        }
        return result;
      } finally {
        state.depth--;
      }
    };
    try {
      Object.defineProperty(
        state.queue,
        "push",
        descriptor
          ? { ...descriptor, value: wrapper }
          : {
              value: wrapper,
              configurable: true,
              writable: true,
              enumerable: false,
            },
      );
      state.wrapper = wrapper;
      mode(state, "Observing pushes");
    } catch {
      mode(state, "Cannot observe push; sampling only");
    }
  }
  function watch(name) {
    if (
      typeof name !== "string" ||
      !name ||
      name.length > 200 ||
      watches.has(name)
    )
      return;
    watches.set(name, { state: null, mode: "Not present" });
    changed();
  }
  function poll() {
    if (polling) return;
    polling = true;
    try {
      for (const [name, watch] of watches) {
        try {
          const queue = window[name];
          if (watch.state?.queue !== queue) {
            watch.state?.names.delete(name);
            watch.state = null;
            changed();
          }
          if (!Array.isArray(queue)) {
            const next =
              queue == null
                ? "Not present"
                : "Unsupported layer (expected an array)";
            if (watch.mode !== next) {
              watch.mode = next;
              changed();
            }
            continue;
          }
          let state = queues.get(queue);
          if (!state) {
            state = { queue, names: new Set(), cursor: 0, depth: 0 };
            queues.set(queue, state);
          }
          state.names.add(name);
          watch.state = state;
          attach(state);
        } catch {
          watch.state?.names.delete(name);
          watch.state = null;
          if (watch.mode !== "Layer inaccessible") {
            watch.mode = "Layer inaccessible";
            changed();
          }
        }
      }
    } finally {
      polling = false;
    }
  }
  window.flowDataLayerCapture = {
    entries,
    snapshot,
    get revision() {
      return revision;
    },
    get dropped() {
      return dropped;
    },
    get layers() {
      return [...watches].map(([name, watch]) => ({
        name,
        status: watch.state?.mode || watch.mode,
      }));
    },
    configure(config) {
      watch(config?.integrations?.vendors?.gcm?.dataLayerName);
      watch(config?.tagManager?.dataLayerName);
      poll();
    },
    refresh: poll,
    clear() {
      // Advance sample cursors before clearing so a refresh cannot replay them.
      poll();
      entries.length = 0;
      dropped = 0;
      changed();
    },
  };
  watch("dataLayer");
  poll();
  setInterval(poll, 200);
})();
