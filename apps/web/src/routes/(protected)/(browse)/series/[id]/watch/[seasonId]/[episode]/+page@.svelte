<script lang="ts">
	import { goto } from "$app/navigation";

	import type { PageProps } from "./$types";
	import Player from "./_components/Player.svelte";
	import {
		getEpisode,
		getPlayback,
		getPlaybackPreferences,
		getProgress,
		savePlaybackPreferences,
		saveProgress,
	} from "./watch.remote";

	let { params }: PageProps = $props();

	const address = $derived({
		seriesId: params.id,
		seasonId: params.seasonId,
		episode: params.episode,
	});
	const { series, season, episode } = $derived(await getEpisode(address));
	const preferences = $derived(await getPlaybackPreferences());
	const progress = $derived(await getProgress(address));

	const playback = $derived(getPlayback(address));
	const next = $derived(playback.current?.next ?? undefined);
	const previous = $derived(playback.current?.previous ?? undefined);

	const following = $derived(next?.season_id === season.id ? next : undefined);

	const key = $derived(`${season.id}/${episode.number}`);
	let nearing = $state<string>();

	const upcoming = $derived(
		nearing === key && following
			? {
					seriesId: series.id,
					seasonId: following.season_id,
					episode: String(following.episode),
				}
			: undefined,
	);
	const preload = $derived(
		upcoming && [getEpisode(upcoming), getPlayback(upcoming), getProgress(upcoming)],
	);

	$effect(() => {
		for (const query of preload ?? []) {
			void query.current;
		}
	});

	const title = $derived(episode.title ?? `Episode ${episode.number}`);
</script>

<svelte:head>
	<title>{title} · {series.title} · Sora</title>
</svelte:head>

<main id="main-content" tabindex="-1">
	<Player
		id={key}
		media={playback.current?.media}
		back="/series/{series.id}"
		previous={previous && `/series/${series.id}/watch/${previous.season_id}/${previous.episode}`}
		next={next && `/series/${series.id}/watch/${next.season_id}/${next.episode}`}
		title="{episode.number}. {title}"
		series={series.title}
		season={series.seasons.length > 1 ? season.title : undefined}
		{preferences}
		start={progress && !progress.finished ? progress.position_seconds : 0}
		onprogress={(position, duration, finished) =>
			saveProgress({
				seasonId: season.id,
				episode: episode.number,
				position_seconds: Math.floor(position),
				duration_seconds: Math.floor(duration),
				finished,
			}).catch(() => {})}
		onpreferences={(changes) =>
			savePlaybackPreferences(changes)
				.updates(
					getPlaybackPreferences().withOverride((current) => ({
						...current,
						...changes,
						subtitles: {
							...current.subtitles,
							...changes.subtitles,
						},
					})),
				)
				.catch(() => {})}
		onnearend={() => (nearing = key)}
		onended={() =>
			goto(
				following
					? `/series/${series.id}/watch/${following.season_id}/${following.episode}`
					: `/series/${series.id}`,
				{ replaceState: true, noScroll: true, keepFocus: !!following },
			)}
	/>
</main>
