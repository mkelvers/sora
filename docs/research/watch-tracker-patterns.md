# Grouped shows, watchlists, and viewing history

Research date: 2026-10-02. This compares public first-party documentation and Jellyfin source code. It is not an authenticated UI audit. Product recommendations below are our conclusions, not rules prescribed by the sources.

## What the products actually separate

Professional services do keep viewing records. A saved list, viewing history, and a Continue Watching row answer different questions. The documentation does not require all three to be represented by one lifecycle label on a show poster.

| Product     | Saved list                                                                            | Viewing record                                                                         | Playback discovery                                                            |
| ----------- | ------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Netflix     | My List contains saved shows and movies                                               | Per-profile viewing activity, downloadable as CSV                                      | Continue Watching, with a separate remove-from-row action                     |
| Disney+     | Watchlist is a manual collection of saved titles                                      | Its help page distinguishes watched content from Watchlist membership                  | Continue Watching and Watch Again are separate from Watchlist                 |
| Crunchyroll | Watchlist saves shows                                                                 | History lists episodes; users can mark an episode, season, or whole show watched       | Episode and season progress remains accessible inside the grouped Series page |
| Plex        | Universal Watchlist saves movies and shows, excluding individual seasons and episodes | Watched/unwatched state and partial playback; manual episode, season, and show marking | Resume, unwatched counts, Continue Watching, and new-season premiere handling |
| Trakt       | Watchlist represents intention to watch                                               | Plays enter history; shows have a separate progress view                               | Continue Watching while more episodes remain                                  |

Sources for each row are explained below. A provider's TV show grouping is narrower than Sora's franchise grouping, which can combine separately cataloged series, films, and OVAs.

## Netflix

My List saves TV shows and movies. Its mobile filters include "Haven't Started" and "Started." A new season affects a saved show's relevance and ordering. The article does not promise a Completed/Dropped lifecycle system for every saved title. [My List](https://help.netflix.com/en/node/10523)

Each profile has viewing activity, and users can download it as CSV. There is no need to discard history to obtain a simple streaming interface. [Viewing activity](https://help.netflix.com/en/node/101917)

Netflix documents removal from Continue Watching separately from hiding viewing history. Hiding history also removes recognition that the title was watched, its recommendation influence, and its Continue Watching entry. These are different user actions, even though they can affect the same row. [Remove from row](https://help.netflix.com/en/node/115312), [Hide viewing history](https://help.netflix.com/en/node/22205)

## Disney+

Disney+ describes Watchlist as manual. Unfinished or watched content is not automatically added to it. The same help article points users to Continue Watching and Watch Again for those needs. This provides a direct example of saved membership separated from playback state. [Managing Watchlist](https://help.disneyplus.com/en-GB/article/disneyplus-en-lc-managing-watchlist)

Disney+ also supports grouping across separate titles. Its Marvel guide describes movie and complete MCU timelines, the latter including series. The Marvel hub organizes chronological rows and character collections. These establish curated franchise navigation. They do not establish a universal "Marvel completed" tracking status. [Official MCU guide](https://www.disneyplus.com/ja-jp/explore/articles/mcu-series), [Marvel hub](https://www.disneyplus.com/browse/page-60f4707d-19bb-4c0c-9390-ab269137be50)

## Crunchyroll

Crunchyroll explicitly supports marking episodes, seasons, and whole shows watched. Season actions are available on the Series page after choosing a season. This is close to Sora's proposed selected-season model, with progress attached to the content inside a grouped page. The article does not document how every anime film and OVA is grouped or counted toward whole-franchise completion. [Mark watched](https://help.crunchyroll.com/hc/en-us/articles/31320247305748-How-do-I-mark-episodes-seasons-and-shows-as-watched)

Its website guide describes a Watchlist for saved shows and a separate History view where individual episodes can be removed. Saving a show and remembering watched episodes are separate capabilities. [Website guide](https://help.crunchyroll.com/hc/en-us/articles/22728708616852-Getting-started-on-Crunchyroll-website)

## Plex

Universal Watchlist stores intended movies and TV shows, not individual seasons or episodes. It can remove watched content automatically when Plex can observe its watched state. Viewing through unrelated services may require manual management. [Universal Watchlist](https://support.plex.tv/articles/universal-watchlist/)

Plex tracks watched, unwatched, and partial progress automatically. Users can mark episodes, whole seasons, and shows manually. A show or season poster in a personal library can display an unwatched episode count. Partially watched items have a Resume action. Plex deliberately omits watched checkmarks on its free streaming and Discover posters while retaining them for seasons and episodes inside a series page. This is evidence that simple posters do not require deleting the underlying progress. [Watched indicators](https://support.plex.tv/articles/201018487-mark-as-watched-or-unwatched/)

Its server settings include a Continue Watching recency window and a default-enabled setting to include a new season's first episode even outside that window, provided previous episodes were watched. This separates being finished with available episodes from returning for a new season. [Library settings](https://support.plex.tv/articles/200289526-library/)

Collections can group related movies and shows and collapse to a collection poster. Matching collection names can relate content from different libraries, such as Star Wars movies and TV shows. Manual collections can have an administrator-defined order. The documentation does not describe a collection as a new TV show with one combined watched/completed state. [Collections](https://support.plex.tv/articles/201273953-collections/)

## Trakt

Trakt's official FAQ calls Watchlist an intention-to-watch list. Recording the first episode removes a show from that list, adds the play to history, and keeps it accessible through calendar, Continue Watching, and progress views. It suggests a custom list when a user wants persistent saved membership instead. [Watchlist FAQ](https://forums.trakt.tv/t/why-do-things-get-removed-from-my-watchlist-after-watching-them/22136)

The API documentation separates show progress from watchlist membership. Progress includes aired episodes, next episode, completion information, and rewatch reset information. Specials can be included or excluded through parameters. Episodes with future or missing air dates do not count as aired. API capability is not proof of the same behavior in every Trakt client. [Official API documentation](https://trakt.docs.apiary.io/)

Specials are still a difficult case in an established tracker. In March 2026, a Trakt staff reply said V3 Up Next did not yet take specials into account, unlike V2. This dated reply is evidence of a known limitation, not a guarantee about every October 2026 deployment. [Staff response](https://forums.trakt.tv/t/up-next-different-ios-app-to-web/102789)

## Jellyfin

Jellyfin organizes shows into series and seasons, with specials in Season 00. Its documentation allows specials to appear within their story season using explicit before/after metadata. Specials can then appear both under Specials and inside the regular season. The documentation warns that special numbering differs between metadata providers. Placement requires metadata; the system does not infer required story content from format alone. [TV show documentation](https://jellyfin.org/docs/general/server/media/shows/)

Its current source keeps playback position, played state, last-play date, and play count as separate item data. Next Up supports resumable and rewatch behavior independently, and uses the special-placement setting when considering specials. This is source inspection of the master branch on the research date, not a claim that every deployed client has identical behavior. [User item data](https://github.com/jellyfin/jellyfin/blob/master/MediaBrowser.Model/Dto/UserItemDataDto.cs), [Next Up implementation](https://github.com/jellyfin/jellyfin/blob/master/Emby.Server.Implementations/TV/TVSeriesManager.cs)

## What this means for Sora

Keep episode history. It is what lets a selected season reliably say Start watching, Continue watching, or Watch again, including when the user watches out of order. Continue Watching should be a convenient shortcut derived from that record. It cannot replace the record and still remember skipped seasons, completed episodes, and rewatches.

Keep one saved franchise poster. Saving expresses interest in that franchise; it need not classify every untouched season as Plan to watch. The selected season controls its play button, while the watch-order dropdown provides navigation.

A streaming-style first version can omit a mandatory visible franchise status. My Shows can contain one poster for each saved or watched franchise, with Continue Watching for active playback and History for past episodes. Slime then needs no ambiguous overall Watching or Plan to watch label. Its poster remains in My Shows, season 2 offers Watch again, season 4 offers Start watching, and the watched OVA does not erase the gap. This is a proposal inferred from the documented separation of lists and progress, not a final user decision or an implemented change.

If Completed filters remain part of Sora's intended tracker experience, keep them as a separate summary calculated over the agreed main watch route. That still requires a reliable main-route policy. None of the fetched sources establishes a universal canon-aware rule that works across arbitrary franchise titles. A curated watch order and an accurate viewing record are separate problems.

## Evidence limits

- Netflix, Trakt, and Jellyfin pages/source were fetched directly. Some Plex support pages returned 403 on direct open; the browser-search tool provided indexed first-party article text instead.
- Disney+ and Crunchyroll help content came from indexed first-party articles where direct fetch returned redirects or JavaScript responses. We did not log into these services or audit their current authenticated interface.
- The product-specific claims describe documented behavior, not private database schemas or universal rules across clients.
- We did not verify the exact grouping of Slime across these services or prove the absence of every possible franchise-completion feature.
- No app code was changed during this research.
