/** One shared deadline; cleanup prevents timers/listeners retaining completed reads. */
export async function withinDeadline<T>(operation: () => PromiseLike<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) throw new Error("analytics_report_deadline");
  let abort: () => void = () => {};
  const deadline = new Promise<never>((_, reject) => {
    abort = () => reject(new Error("analytics_report_deadline"));
    signal.addEventListener("abort", abort, { once: true });
  });
  try { return await Promise.race([Promise.resolve().then(operation), deadline]); }
  finally { signal.removeEventListener("abort", abort); }
}
