export const AI_GENERATION_MS = 15_000;
export const AI_ROUTE_MS = 18_000;
export const AI_CLIENT_MS = 20_000;
export const AI_TELEMETRY_MS = 1_000;

export function createDeadline(milliseconds: number, parent?: AbortSignal) {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const dispose = () => {
    if (timer !== undefined) clearTimeout(timer);
    parent?.removeEventListener("abort", onParentAbort);
  };
  const cancel = (reason: unknown = new DOMException("Request cancelled", "AbortError")) => {
    controller.abort(reason);
    dispose();
  };
  const onParentAbort = () => cancel(parent?.reason);
  if (parent?.aborted) onParentAbort();
  else {
    parent?.addEventListener("abort", onParentAbort, { once: true });
    timer = setTimeout(() => cancel(new DOMException("AI deadline exceeded", "TimeoutError")), milliseconds);
  }
  return { signal: controller.signal, cancel, dispose };
}

/** Bounds waiting even for transports that ignore abort; late outcomes remain observed. */
export function waitForSignal<T>(signal: AbortSignal, operation: () => PromiseLike<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(signal.reason); return; }
    const onAbort = () => reject(signal.reason);
    signal.addEventListener("abort", onAbort, { once: true });
    const cleanup = () => signal.removeEventListener("abort", onAbort);
    try {
      Promise.resolve(operation()).then(
        value => { cleanup(); if (signal.aborted) reject(signal.reason); else resolve(value); },
        error => { cleanup(); reject(error); },
      );
    } catch (error) { cleanup(); reject(error); }
  });
}

export function generationOptions(signal: AbortSignal) {
  signal.throwIfAborted();
  return { maxRetries: 0, timeout: { totalMs: AI_GENERATION_MS }, abortSignal: signal };
}

export function aiFailureReason(error: unknown, signal?: AbortSignal): "timeout" | "cancelled" | "provider-error" {
  const reason = signal?.aborted ? signal.reason : error;
  if (reason instanceof Error && reason.name === "TimeoutError") return "timeout";
  if (signal?.aborted || (reason instanceof Error && reason.name === "AbortError")) return "cancelled";
  return "provider-error";
}

/** Best-effort telemetry is awaited, abortable, and never extends the parent deadline. */
export async function boundedTelemetry(operation: (signal: AbortSignal) => PromiseLike<unknown>, parent?: AbortSignal) {
  const deadline = createDeadline(AI_TELEMETRY_MS, parent);
  try { await waitForSignal(deadline.signal, () => operation(deadline.signal)); }
  catch { /* Telemetry must never replace the primary result. */ }
  finally { deadline.dispose(); }
}

export function createRequestSlot() {
  let active: ReturnType<typeof createDeadline> | undefined;
  const cancel = () => {
    const previous = active;
    active = undefined;
    previous?.cancel();
  };
  return {
    cancel,
    begin(milliseconds = AI_CLIENT_MS) {
      cancel();
      const request = createDeadline(milliseconds);
      active = request;
      return {
        signal: request.signal,
        isCurrent: () => active === request,
        canCommit: () => active === request && !request.signal.aborted,
        finish: () => {
          request.dispose();
          if (active !== request) return false;
          active = undefined;
          return true;
        },
      };
    },
  };
}

export class AiHttpError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export async function fetchAiJson<T>(url: string, init: RequestInit, signal: AbortSignal, fetcher: typeof fetch = fetch): Promise<T> {
  return waitForSignal(signal, async () => {
    const response = await fetcher(url, { ...init, signal });
    const data = await response.json().catch(() => null);
    signal.throwIfAborted();
    if (!response.ok) throw new AiHttpError(typeof data?.error === "string" ? data.error : `Permintaan AI gagal (HTTP ${response.status}).`, response.status);
    if (!data || typeof data !== "object") throw new Error("Respons AI tidak valid. Coba lagi atau gunakan input manual.");
    return data as T;
  });
}
