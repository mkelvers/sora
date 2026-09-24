/** Durations in milliseconds, for cache lifetimes and timeouts. */
export const second = 1_000;
export const minute = 60 * second;
export const hour = 60 * minute;
export const day = 24 * hour;

/** What {@link startDeadline} resolves with once its time is up. */
export const timedOut = Symbol("timedOut");

/** A promise that resolves with {@link timedOut} after `ms`, and a way to cancel it. */
export function startDeadline(ms: number) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const reached = new Promise<typeof timedOut>((resolve) => {
    timer = setTimeout(resolve, ms, timedOut);
  });

  return {
    reached,
    clear: () => clearTimeout(timer)
  };
}
