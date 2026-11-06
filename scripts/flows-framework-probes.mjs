import { captureConsentData } from "./flows-consent-state.mjs";

const map = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const listenerId = (value) =>
  (typeof value === "number" && Number.isFinite(value)) ||
  (typeof value === "string" && value.length > 0 && value.length < 256);

export function frameworkPhase(kind, payload) {
  if (!map(payload)) return "error";
  if (payload.cmpStatus === "error") return "error";
  if (
    payload.cmpStatus === "stub" ||
    payload.cmpStatus === "loading" ||
    payload.cmpLoaded === false
  )
    return "stub/loading";
  if (kind === "tcf" && payload.gdprApplies === false) return "not applicable";
  if (
    kind === "gpp" &&
    payload.signalStatus === "ready" &&
    payload.applicableSections?.length === 1 &&
    payload.applicableSections[0] === -1
  )
    return "not applicable";
  if (
    payload.cmpStatus === "loaded" &&
    (kind === "tcf"
      ? payload.cmpLoaded === true ||
        ["tcloaded", "cmpuishown", "useractioncomplete"].includes(
          payload.eventStatus,
        )
      : payload.signalStatus === "ready")
  )
    return "ready";
  return "responded";
}

// Each API/command owns its timeout. A queued listener can report an ID after
// disposal: the callback still requests removal but cannot update the new view.
export function createFrameworkProbe(
  kind,
  getAPI,
  notify,
  { timeout = 5000, historyLimit = 30 } = {},
) {
  let session;
  let history = [];
  let state = {
    ping: { phase: "not probed" },
    events: { phase: "not probed" },
  };
  const emit = () => notify({ kind, ...state, history: [...history] });
  function record(command, phase, data, success, note) {
    const captured = captureConsentData(data);
    const entry = {
      command,
      phase,
      observedAt: new Date().toISOString(),
      success: success === undefined ? "not returned" : success,
      response: captured.value,
      notes: captured.notes,
      ...(note ? { note } : {}),
    };
    history = [...history, entry].slice(-historyLimit);
    state = { ...state, [command]: entry };
    emit();
  }
  function call(api, command, callback, parameter) {
    if (kind === "tcf") api("" + command, 2, callback, parameter);
    else api("" + command, callback, parameter);
  }
  function remove(current, id) {
    if (!listenerId(id) || current.removed.has(id)) return;
    current.removed.add(id);
    try {
      // A drained startup stub may no longer forward queued commands. Its late
      // registration belongs to the replacement API.
      const replacement = getAPI();
      const target =
        current.stub && typeof replacement === "function"
          ? replacement
          : current.api;
      call(target, "removeEventListener", () => {}, id);
    } catch {
      /* Best effort on API teardown. */
    }
  }
  function dispose() {
    if (!session) return;
    session.closed = true;
    Object.values(session.timers).forEach(clearTimeout);
    for (const id of session.ids) remove(session, id);
    session = undefined;
  }
  function refresh() {
    dispose();
    const api = getAPI();
    if (typeof api !== "function") {
      for (const command of ["ping", "events"]) record(command, "absent", null);
      return;
    }
    const current = {
      api,
      stub: api.stub === true,
      closed: false,
      ids: new Set(),
      removed: new Set(),
      timers: {},
    };
    session = current;
    for (const command of ["ping", "events"]) {
      record(command, api.stub === true ? "stub/loading" : "probing", null);
      current.timers[command] = setTimeout(() => {
        if (!current.closed)
          record(
            command,
            "timed out",
            null,
            undefined,
            `No ${command} response within ${timeout} ms. A startup stub may still be queued.`,
          );
      }, timeout);
      try {
        call(
          api,
          command === "events" ? "addEventListener" : "ping",
          (response, success) => {
            // Snapshot first: rendering never retains mutable SDK payload objects.
            const data = captureConsentData(response).value;
            const id = map(data) ? data.listenerId : undefined;
            if (command === "events" && listenerId(id)) {
              current.ids.add(id);
              if (current.closed) {
                remove(current, id);
                return;
              }
            }
            if (current.closed) return;
            clearTimeout(current.timers[command]);
            if (success === false || !map(data)) {
              record(
                command,
                "error",
                data,
                success,
                "Callback failed or returned an unsupported payload.",
              );
              return;
            }
            const status =
              kind === "gpp" && command === "events" ? data.pingData : data;
            if (status?.cmpStatus === "stub") current.stub = true;
            if (!map(status)) {
              record(
                command,
                "error",
                data,
                success,
                "No status object was returned.",
              );
              return;
            }
            record(command, frameworkPhase(kind, status), data, success);
          },
        );
      } catch (error) {
        clearTimeout(current.timers[command]);
        record(
          command,
          "error",
          null,
          false,
          String(error?.message || "API call failed").slice(0, 500),
        );
      }
    }
  }
  return {
    refresh,
    dispose,
    clear() {
      dispose();
      history = [];
      state = { ping: { phase: "cleared" }, events: { phase: "cleared" } };
      emit();
    },
    apiChanged() {
      return session?.api !== getAPI();
    },
  };
}
