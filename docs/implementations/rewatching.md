# Rewatching

Implementation brief for the agreed rewatch flow. Reuse the existing controls and show the actions relevant to the current state.

## Completion and current viewing

A completed season stays Completed throughout a rewatch. Rewatching tracks a new viewing of something the user has already finished.

Keep the original completion and watched episodes remembered separately from the current rewatch position. Replaying part of an episode must preserve its earlier completion.

## Starting and continuing

Pressing Rewatch starts the selected season at episode one, at 0:00. Its episode list then reflects the current viewing:

- Episodes not yet played during this rewatch show their duration and use normal opacity.
- Partly played episodes show time remaining and a progress bar.
- Episodes finished during this rewatch show "Watched" and use the existing dimmed appearance.

The main playback button follows the current state:

| State                                | Main button                                            |
| ------------------------------------ | ------------------------------------------------------ |
| Never started                        | Start watching                                         |
| First viewing or rewatch in progress | Continue watching, with the next or unfinished episode |
| Completed, with no active rewatch    | Rewatch                                                |

Leaving the player preserves the current episode and position. Returning resumes that viewing. Finishing the season ends the rewatch automatically, removes it from Continue Watching, and restores the normal completed view.

## Putting a rewatch aside

Remove from Continue Watching hides the season from Home and preserves the rewatch position and episode indicators. Its status stays Completed.

Visiting the season again still offers Continue watching at the saved position. Playing it again brings it back into Continue Watching.

The same removal action preserves unfinished progress during a first viewing. Removing a card does not set its status to Dropped.

## Returning to the completed state

During a rewatch, the existing season-menu action is "Mark season as watched", even though the season was already completed previously.

Using it clears the active rewatch and its resume position, removes the season from Continue Watching, and restores the original watched episode appearance. The main button becomes Rewatch. Pressing it starts a fresh viewing at episode one.

This action restores the original completed state. Preserve the original completion record and dates; ending a rewatch this way does not record another finished viewing.

Reuse this menu item. Do not add "Stop rewatching", "Clear rewatch progress", a Paused status, or a separate rewatch status in the library.

## Black Clover example

Black Clover is Completed. The user presses Rewatch and reaches episode eight.

| Action                        | Result                                                                           |
| ----------------------------- | -------------------------------------------------------------------------------- |
| Leave the player              | Save the position and keep Black Clover in Continue Watching                     |
| Remove from Continue Watching | Hide it from Home; revisiting Black Clover still offers episode eight            |
| Mark season as watched        | Clear the rewatch; restore the completed view and offer Rewatch from episode one |
| Finish the season             | End the rewatch automatically and return to the completed view                   |

## Implementation checklist

- Preserve original completion while updating current rewatch progress in `packages/core/src/library/progress/progress.ts` and `packages/core/src/database/schema/library.ts`.
- Keep Completed unchanged in `packages/core/src/library/watchlist/status.ts`.
- Make the existing mark-season action restore prior completion during a rewatch, preserving the original completion dates.
- Render episode indicators from current rewatch progress in `apps/web/src/routes/(app)/series/[id]/+page.svelte` and its episode components.
- Make the season-menu label depend on whether a rewatch is active. Prior completion must not make it offer "Mark season as unwatched" during a rewatch.
- Refresh the season page and Continue Watching after each relevant action through `series.remote.ts` and the existing Home commands.

## Verification

- [ ] Rewatch starts episode one at 0:00 while the season remains Completed.
- [ ] Episode labels, dimming, and progress bars reflect only the current viewing during a rewatch.
- [ ] Reloading or leaving and returning preserves the current episode and position.
- [ ] Removing a rewatch from Continue Watching preserves its position; resuming brings the card back.
- [ ] Marking the season watched at episode eight restores all original watched indicators, removes the card, and offers Rewatch from episode one, including after reload.
- [ ] Original completion survives partial playback and ending the rewatch manually.
- [ ] Finishing the season ends the rewatch automatically.
- [ ] A first viewing still works normally, and the interface has no additional controls.
