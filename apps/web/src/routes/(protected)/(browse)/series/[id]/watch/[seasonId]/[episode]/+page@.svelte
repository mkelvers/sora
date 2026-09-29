<script lang="ts">
	import { goto } from "$app/navigation";

	import type { PageProps } from "./$types";
	import Player from "./_components/Player.svelte";
	import { getEpisode, getPlayback, saveProgress } from "./watch.remote";

	let { params }: PageProps = $props();

	const address = $derived({
		seriesId: params.id,
		seasonId: params.seasonId,
		episode: params.episode,
	});
	const { series, season, episode, start } = $derived(await getEpisode(address));

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
	const preload = $derived(upcoming && [getEpisode(upcoming), getPlayback(upcoming)]);

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
		problem={playback.current?.problem}
		onretry={() => playback.refresh()}
		back="/series/{series.id}"
		previous={previous && `/series/${series.id}/watch/${previous.season_id}/${previous.episode}`}
		next={next && `/series/${series.id}/watch/${next.season_id}/${next.episode}`}
		title="{episode.number}. {title}"
		series={series.title}
		season={series.seasons.length > 1 ? season.title : undefined}
		{start}
		onprogress={(position, duration) =>
			saveProgress({
				seriesId: series.id,
				seasonId: season.id,
				episode: episode.number,
				position,
				duration,
			}).catch(() => {})}
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
