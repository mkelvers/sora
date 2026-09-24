/**
 * Per-user library: watchlist, playback progress, and continue watching.
 *
 * Every function takes an opaque `userId` from the caller's identity layer.
 * The core trusts it, so callers must authenticate before calling. Titles
 * and episodes are addressed by Sora series and season IDs.
 *
 * @packageDocumentation
 */
export { getContinueWatching } from "./progress/continue-watching";
export {
  clearProgress,
  getProgress,
  ProgressUpdateSchema,
  recordProgress,
  type ProgressUpdate
} from "./progress/progress";
export type { ContinueWatchingItem, EpisodeProgress } from "./progress/resume";
export {
  getWatchlist,
  getWatchlistEntry,
  removeFromWatchlist,
  setWatchlistStatus,
  WatchlistStatusSchema,
  type WatchlistEntry,
  type WatchlistItem,
  type WatchlistStatus
} from "./watchlist/watchlist";
