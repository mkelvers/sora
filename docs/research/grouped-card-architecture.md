# One grouped card with independent season progress

Researched 2026-10-03. Primary documentation and upstream source inspection; authenticated applications were not exercised. This is architectural research, not an implementation or a final product specification.

## Finding

There are working examples of one show entry displaying a current episode while retaining independent progress for all its seasons. The useful separation is between library membership, watched facts, and the next action. A card can combine those facts without becoming the authoritative state for its children.

These examples group seasons under a single TV-series identity. They do not demonstrate a universal anime-franchise model spanning unrelated adaptations, movies, OVAs, alternative timelines, or disputed canon. Sora still has to define its grouping membership, but grouping does not have to define viewing completion or playback order.

## Showly: direct source evidence

Inspected upstream [trakt/showly](https://github.com/trakt/showly) at commit `e08cb90ba0205ed9401a11265b912b0302f253b5`.

- An [Episode](https://github.com/trakt/showly/blob/e08cb90ba0205ed9401a11265b912b0302f253b5/data-local/src/main/java/com/michaldrabik/data_local/database/model/Episode.kt) owns its watched boolean and last-watched timestamp and identifies its season and show. A [Season](https://github.com/trakt/showly/blob/e08cb90ba0205ed9401a11265b912b0302f253b5/data-local/src/main/java/com/michaldrabik/data_local/database/model/Season.kt) holds episode counts and a watched summary. [MyShow](https://github.com/trakt/showly/blob/e08cb90ba0205ed9401a11265b912b0302f253b5/data-local/src/main/java/com/michaldrabik/data_local/database/model/MyShow.kt) independently holds show membership and dates.
- [MyShowsRepository](https://github.com/trakt/showly/blob/e08cb90ba0205ed9401a11265b912b0302f253b5/repository/src/main/java/com/michaldrabik/repository/shows/MyShowsRepository.kt) inserts show membership and removes that show from watchlist/archive in one transaction. [HiddenShowsRepository](https://github.com/trakt/showly/blob/e08cb90ba0205ed9401a11265b912b0302f253b5/repository/src/main/java/com/michaldrabik/repository/shows/HiddenShowsRepository.kt) moves membership to archive without updating episode watched facts.
- [ProgressItemsCase](https://github.com/trakt/showly/blob/e08cb90ba0205ed9401a11265b912b0302f253b5/ui-progress/src/main/java/com/michaldrabik/ui_progress/progress/cases/ProgressItemsCase.kt) maps each followed show to one progress item containing the show, poster, chosen next episode, that episode's season, and separately computed watched/total counts. It filters items with no qualifying next episode from the Progress screen; it does not remove My Shows membership. Next selection can use either the oldest unwatched episode or the first unwatched episode after the last watched one. Count computation is separate from this selection.
- [ProgressItemView](https://github.com/trakt/showly/blob/e08cb90ba0205ed9401a11265b912b0302f253b5/ui-progress/src/main/java/com/michaldrabik/ui_progress/progress/views/ProgressItemView.kt) renders the show title/poster, season/episode subtitle, progress, and an episode action. This is concrete evidence of one visual show item representing an active newer season plus combined historical progress.
- [EpisodesDao](https://github.com/trakt/showly/blob/e08cb90ba0205ed9401a11265b912b0302f253b5/data-local/src/main/java/com/michaldrabik/data_local/database/dao/EpisodesDao.kt) excludes season zero from next selection, last-watched lookup, and progress counts. Aired-only counts limit the date to now; all-episode counts include stored future episodes. Special exclusion is a numbering policy, not a canon judgment.
- [MyShowsLoadShowsCase](https://github.com/trakt/showly/blob/e08cb90ba0205ed9401a11265b912b0302f253b5/ui-my-shows/src/main/java/com/michaldrabik/ui_my_shows/myshows/cases/MyShowsLoadShowsCase.kt) computes library filters from regular-season summaries and production status: Watching has an unwatched aired season; Finished requires all seasons watched and an ended/cancelled show; Returning includes returning shows whose aired seasons are watched. The associated [section enum](https://github.com/trakt/showly/blob/e08cb90ba0205ed9401a11265b912b0302f253b5/ui-model/src/main/java/com/michaldrabik/ui_model/MyShowsSection.kt) is a filter definition, not a persisted user lifecycle on the show record.
- [SeasonView](https://github.com/trakt/showly/blob/e08cb90ba0205ed9401a11265b912b0302f253b5/ui-show/src/main/java/com/michaldrabik/ui_show/sections/seasons/recycler/SeasonView.kt) shows each season's watched episode count, progress and watched control inside the grouped show page.

### Showly limitation relevant to Sora

The inspected code uses a next-episode heuristic; it does not store an explicit active season. With the “after last watched” setting, earlier unseen episodes can remain in the counts while no next episode qualifies. With “oldest unwatched,” earlier gaps can take over the shortcut. Those are different policies, not proof that either always expresses user intent. Copying the last-event heuristic would reproduce part of Sora's problem.

The upstream community has reported [the same skipped-season pain](https://github.com/trakt/showly/discussions/848): an unseen earlier season keeps a show in progress although the viewer does not intend to watch it. This discussion is evidence of user experience, not an independently verified current UI contract. The [maintainer's explanation](https://github.com/trakt/showly/discussions/1035) confirms that My Shows is for tracking while Watchlist is for future intentions.

## SeriesGuide: summary and next action are different fields

Inspected [UweTrottmann/SeriesGuide](https://github.com/UweTrottmann/SeriesGuide) at commit `12a9bbc9bda2c6e3235a84e77eabd812fa2a3f8a`.

- [SgEpisode2](https://github.com/UweTrottmann/SeriesGuide/blob/12a9bbc9bda2c6e3235a84e77eabd812fa2a3f8a/app/src/main/java/com/battlelancer/seriesguide/shows/database/SgEpisode2.kt) holds watched/skipped/unwatched, play count, and show/season IDs.
- [SgShow2](https://github.com/UweTrottmann/SeriesGuide/blob/12a9bbc9bda2c6e3235a84e77eabd812fa2a3f8a/app/src/main/java/com/battlelancer/seriesguide/shows/database/SgShow2.kt) separately holds favorite, hidden and notification choices, plus cached next episode and unwatched count.
- [NextEpisodeUpdater](https://github.com/UweTrottmann/SeriesGuide/blob/12a9bbc9bda2c6e3235a84e77eabd812fa2a3f8a/app/src/main/java/com/battlelancer/seriesguide/shows/tools/NextEpisodeUpdater.kt) selects the next episode relative to the last watched release and separately counts remaining episodes. It can produce no next episode while keeping a nonzero remaining count. Special inclusion is configurable for the next action.
- [SgEpisode2Helper](https://github.com/UweTrottmann/SeriesGuide/blob/12a9bbc9bda2c6e3235a84e77eabd812fa2a3f8a/app/src/main/java/com/battlelancer/seriesguide/shows/database/SgEpisode2Helper.kt) counts remaining regular episodes only if released, dated, and unwatched. Season helpers separately count future, unknown-release, and skipped episodes.
- [ShowsViewHolder](https://github.com/UweTrottmann/SeriesGuide/blob/12a9bbc9bda2c6e3235a84e77eabd812fa2a3f8a/app/src/main/java/com/battlelancer/seriesguide/shows/ShowsViewHolder.kt) binds one show poster/title with next episode and remaining count. Its next-watched action is visible only if a next episode exists.

This confirms the presentation pattern, but its forward-only release heuristic is not suitable as a complete solution to Sora's earlier missing seasons.

In a [SeriesGuide support discussion](https://discuss.seriesgui.de/t/shows-added-list-is-too-crowded-to-be-useful-see-tv-time-watch-list-for-inspiration/2366), the maintainer explains that Unwatched and Upcoming depend on the next episode, while Continuing depends on broadcast status. The user's confusion illustrates why those meanings need clear names. This is documentation of a reported experience and maintainer explanation, not a current UI test.

## Others have encountered the same ambiguity

In a [Trakt support thread](https://forums.trakt.tv/t/hiding-a-season-on-watched-progress/17768), a viewer watching True Detective season four reported unseen season one appearing in Up Next between new season-four episodes. A support reply describes hiding a season from Progress and Up Next while retaining it on the show page and allowing episode marking. This is firsthand pain and a documented response from 2024, not a source inspection of current Trakt internals.

[Simkl's documented policy](https://docs.simkl.org/how-to-use-simkl/faq/frequently-asked-questions/why-cant-i-add-a-show-that-has-not-ended-to-completed) keeps an ongoing show in Watching even when every aired episode is watched; Completed requires an ended show. This is a deliberate tradeoff, not an answer to canon or a policy Sora must copy. Its [progress documentation](https://docs.simkl.org/how-to-use-simkl/core-features/content-tracking/tracking-content/progress-tracking) includes episode/season marking and next-unwatched dashboard actions.

Simkl also documents a [remaining-episode badge](https://docs.simkl.org/how-to-use-simkl/getting-started-with-simkl/quick-start-guide/color-indications) derived from available unwatched episodes. A concise factual count is another grouped-card summary. Sora should use words or numbers alongside any color.

## Jellyfin: API represents progress facts separately

The [stable Jellyfin OpenAPI schema](https://api.jellyfin.org/openapi/jellyfin-openapi-stable.json) exposes `UserItemDataDto` with `PlayedPercentage` and `UnplayedItemCount` separately from `PlaybackPositionTicks`, `LastPlayedDate`, `PlayCount`, `Played`, and `IsFavorite`. Its seasons endpoint can include per-item user data. This is API contract evidence that historical aggregates, playback position, and preference can coexist, not proof of a particular minimal card design or canonical watch order.

## A lightweight architectural interpretation

[Microsoft's read/write-model guidance](https://learn.microsoft.com/en-us/azure/architecture/patterns/cqrs) describes distinct display projections and update models using one shared database. Messaging is not required; event sourcing can add considerable complexity. For Sora, the useful idea is a card-specific query result, not a recommendation for queues, additional databases, or an event-sourcing system.

Sora already derives franchise summaries. Merely adding another summary wrapper would not be a reset. The material change is ownership: display summaries must never become authoritative inputs that determine episode progress, the selected release's button, saved intent, dropping, or continuation.

## Proposed Sora application, not an observed product implementation

Keep one franchise card in every library view, built from separate facts:

| Owner                   | Fact                                                                                      |
| ----------------------- | ----------------------------------------------------------------------------------------- |
| Franchise membership    | Keep this grouped title in My Shows; optional follow/archive preference.                  |
| Release/episode records | Watched episodes, resume position, release-specific saved or stopped intentions.          |
| Playback focus          | The part currently selected for continuation; explicit playback/navigation can choose it. |
| Card query              | One poster plus concise historical summary and one current action.                        |
| Watch-order metadata    | Helpful ordering of parts; never evidence that the user watched them.                     |

A minimal card can show two compatible facts:

> That Time I Got Reincarnated as a Slime  
> 3 seasons watched  
> Continue S4 · E3

Opening the card reveals exact per-part state. Small watched checks and selected-season progress are sufficient; the watch-order dropdown does not need a list of lifecycle labels.

The card's action prioritizes a partial episode in the chosen part, then remaining episodes within that part. Completing or bulk-marking an unrelated OVA must not steal season four's playback focus. Selecting an untouched part offers Start; selecting a fully watched part offers Watch again. These focus rules are a proposal informed by the limitations above, not functionality confirmed in Showly or SeriesGuide.

When no part is active, the card can show watched counts or a scoped action such as Start season four. That is a suggestion, not proof of interest or an automatic Plan to watch record. Any suggestion policy remains a separate decision.

### Scenarios to validate before choosing categories

- Three seasons watched, season four untouched, final OVA watched: history remains accurate, no overall completion claim; no false Plan to watch, Watching or Continue action for season four without corresponding intent/activity.
- Season four active and an extra marked watched: one card continues season four and preserves the extra's watched record.
- All current regular seasons watched, extras untouched: the card reports watched seasons without claiming all grouped releases complete.
- Season four dropped but a film active: one card can still continue the film; dropping one part cannot erase the others.
- New release added later: prior watched facts remain unchanged; catalog availability is distinct from user intention.
- Rewatching a watched season: historical completion and current resume coexist.
- Two parts started: one card needs a deterministic focus and access to the other inside details; do not silently infer which matters from ordering.

The remaining library-category decision should be tested against these facts. A single mutually exclusive franchise status will force a lossy priority rule. Filters could instead select cards with matching child activity or intent, deduplicated by franchise; this allows the same franchise in multiple filtered views while appearing once within each view. That is a proposal with a UX tradeoff, not a sourced universal convention.

## Scope and uncertainty

No inspected example solves anime franchise membership, canon, chronology, or incomplete provider inventories universally. None proves that one card must carry one shared lifecycle status. They do show that child-level watched facts, parent membership, and current action can coexist behind one grouped visual entry. Application code is unchanged by this research.
