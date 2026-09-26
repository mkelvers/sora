<script lang="ts">
	import Player from './_components/Player.svelte';
	import { getEpisode, getPlayback } from './watch.remote';
	import type { PageProps } from './$types';

	let { params }: PageProps = $props();

	const address = $derived({ seriesId: params.id, seasonId: params.seasonId, episode: params.episode });
	const { series, season, episode } = $derived(await getEpisode(address));

	const playback = $derived(getPlayback(address));

	const title = $derived(episode.title ?? `Episode ${episode.number}`);
	const base = $derived(`/series/${series.id}/watch/${season.id}`);
</script>

<svelte:head>
	<title>{title} · {series.title}</title>
</svelte:head>

{#key `${params.seasonId}/${params.episode}`}
	<Player
		media={playback.current?.media}
		problem={playback.current?.problem}
		onretry={() => playback.refresh()}
		back="/series/{series.id}"
		previous={episode.number > 1 ? `${base}/${episode.number - 1}` : undefined}
		next={episode.number < season.episode_count ? `${base}/${episode.number + 1}` : undefined}
		title="{episode.number}. {title}"
		series={series.title}
		season={season.title}
	/>
{/key}
