# Franchise tracking without extra UI

Research date: 2026-10-02. Sources below are primary documentation and the official Slime sites. Recommendations are product choices, not claims made by those sources.

## What the metadata can tell us

- AniList documents `PREQUEL` and `SEQUEL` as release relationships. It also distinguishes side stories, summaries, alternatives, and spin-offs. These describe connections, not required viewing. [MediaRelation](https://github.com/AniList/docs/blob/master/docs/reference/enum/mediarelation.md)
- AniList formats describe how an anime was distributed. An OVA, movie, or special is not inherently optional. The documented `Media` fields include relations, release dates, source material, and episode counts, but no canon or required-viewing field. [MediaFormat](https://github.com/AniList/docs/blob/master/docs/reference/enum/mediaformat.md), [Media](https://github.com/AniList/docs/blob/master/docs/reference/object/media.md)
- TMDB supports episode groups for original air date, absolute, DVD, digital, story arc, production, and TV order. Availability depends on groups added to each show. An order is separate from completion and is not proof of canon. [Episode groups](https://developer.themoviedb.org/reference/tv-series-episode-groups), [Group types](https://developer.themoviedb.org/reference/tv-episode-group-details)
- I did not find `airs_before_season_number`, `airs_after_season_number`, or `airs_before_episode_number` in the fetched TMDB documentation. Do not design around these as confirmed TMDB fields. The season response documents dates and season/episode numbers; episode groups supply explicit alternate order. [Season details](https://developer.themoviedb.org/reference/tv-season-details)

## Slime demonstrates the difference

The official Visions of Coleus introduction places its three episodes between TV seasons 1 and 2 and identifies Fuse's bonus novel as their source. The release announcement dates the streaming release to November 1, 2023. Story placement and release placement therefore differ. Neither page says users must watch it to complete the TV story. [Introduction](https://www.ten-sura.com/anime/coleus/introduction), [Release announcement](https://www.ten-sura.com/news/anime/coleus/news/post/9015)

The official Tears of the Azure Sea site credits Fuse's story concept and full supervision. Its synopsis starts after Tempest's opening festival. That supports story placement and creator involvement; it does not establish a noncanon classification or required viewing. [Official film site](https://movie02.ten-sura.com/)

Season 4 started its announced broadcast on April 3, 2026. On this research date it should not be dismissed as an unreleased sequel merely because a later-listed OVA is watched. Individual episode availability still needs catalog verification. [Official broadcast announcement](https://www.ten-sura.com/news/anime/tensura/onair/post/11190)

## Recommended first fix

Keep one franchise and the existing short labels. The complexity belongs in the rules, not in a longer status sentence or more dropdown controls.

1. Every episode keeps its own watched state. Watching any later season, film, or OVA never marks earlier episodes watched.
2. Calculate `Completed` from all released entries in the existing main watch route, including untouched earlier seasons. Extras keep their own progress without undoing main-route completion. Unknown or future episodes must not produce false completion.
3. Continue the chosen unfinished season first. When the latest watched item is finished, find remaining main-route content even if it appears earlier in the list, then offer untouched extras. Only use `Watch again` after no released unwatched content remains. Preserve the existing opt-in behavior for later releases and airing seasons.
4. Keep unstarted extras visible and individually playable, without forcing autoplay into them. They need not block the short `Completed` status, but their own rows must stay unwatched. The franchise status and an extra's watched state answer different questions.
5. Keep the existing dropdown as a selection list with titles and episode counts. Avoid canon badges, ordering switches, interest toggles, and explanatory paragraphs in this first fix.

The existing `inWatchOrder` value is a routing policy inferred from provider relationships. Treat it as that policy, not a verified canon flag. Improving its classifications is separate from repairing the progress calculation.

## Foundation for later ordering work

Use release order when the only reliable evidence is dates. A curated recommended order can override it when official story placement or specific franchise knowledge supports that decision. Store that evidence separately from watched progress. Never change watched history when an order changes.

The initial fix should preserve existing catalog order. It cannot honestly promise the ideal watch order for every franchise. Visions of Coleus shows why a universal sort cannot establish both release order and story chronology.

The user chose main-route completion for this first version. Untouched extras stay available through the existing play button and do not need an interest toggle or skip state. Later releases retain the existing opt-in behavior rather than automatically restoring a completed franchise to Continue Watching.

## Checks the implementation should pass

- Seasons 1–3 watched, season 4 unwatched, final OVA watched: franchise remains active and the main action offers season 4.
- Later regular season watched with an earlier regular season untouched: the earlier season still blocks completion and remains available.
- Main route watched, an extra half watched: keep `Completed` and resume the extra through the play button.
- Main route watched, unstarted extras remain: the short completion status is allowed; the main action offers an extra and its row remains unwatched.
- A watched episode becomes unwatched: progress, completion, and the primary action update together.
- Catalog ordering changes: no watched state changes.

## Verified first implementation

- Created a separate test account and signed in through the local browser. No existing profile's progress was used for mutations.
- Slime: marked seasons 1–3 and OVA Season 2 watched through the UI. Coleus, the film, and season 4 remained unwatched; the hero offered Coleus and the API reported `watching`, not completion.
- After marking Coleus and the film watched, the hero showed `Continue watching S4 E1`. Season 4 remained unwatched.
- Toradora: marked its finished main season watched through the UI. The API reported `completed` while the hero offered its untouched special.
- Marking Toradora episode 1 unwatched through the UI restored `watching` and `Continue watching E1`. Marking it watched restored completion.
- A saved partial-progress fixture for Toradora's special preserved `completed` and the live hero showed `Continue watching Specials E1`. This verified resume state, not actual stream playback.
- 71 library tests passed, workspace type checks passed with zero Svelte diagnostics, and the web production build passed. The browser disconnected before a separate visual check of the Completed filter.
