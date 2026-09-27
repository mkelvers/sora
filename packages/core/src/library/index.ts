/**
 * Per-user library: watchlist, playback progress and history, continue
 * watching, imports, and recommendations.
 *
 * Every function takes an opaque `userId` from the caller's identity layer.
 * The core trusts it, so callers must authenticate before calling. Titles
 * and episodes are addressed by Sora series and season IDs.
 *
 * The watchlist stores only what a user chose: that a title is listed, and
 * whether they dropped it. How far they are through a title is read from
 * their progress, so it stays true as the title gains seasons.
 *
 * @packageDocumentation
 */
export { AniListUserNameSchema, importAniListList, type ImportSummary } from "./import/anilist";
export { dismissFromContinueWatching, getContinueWatching } from "./progress/continue-watching";
export { getHistory, type HistoryItem, type HistoryPage } from "./progress/history";
export {
  clearProgress,
  forgetEpisode,
  getProgress,
  markWatched,
  ProgressUpdateSchema,
  recordProgress,
  type ProgressUpdate
} from "./progress/progress";
export type { ContinueWatchingItem, EpisodeProgress, SeasonCompletion, TitleProgress, WatchStatus } from "./progress/resume";
export { getRecommendations } from "./recommendations/recommendations";
export {
  addToWatchlist,
  getLibraryTitle,
  getWatchlist,
  removeFromWatchlist,
  setDropped,
  WatchStatusSchema,
  type CurrentSeason,
  type LibraryTitle,
  type NamedSeason,
  type TitleState,
  type Watchlist,
  type WatchlistItem
} from "./watchlist/watchlist";
