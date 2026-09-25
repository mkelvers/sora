<script lang="ts">
	import Player from './_components/Player.svelte';
	import { getEpisode } from './watch.remote';
	import type { PageProps } from './$types';

	let { params }: PageProps = $props();
</script>

<svelte:boundary>
	{@const { series, season, episode } = await getEpisode(params)}

	{#key `${params.seasonId}/${params.episode}`}
		<Player
			animeId={series.id}
			seasonId={season.id}
			episode={episode.number}
			episodeCount={season.episode_count}
			series={series.title}
			season={season.title}
			title={episode.title ?? `Episode ${episode.number}`}
		/>
	{/key}
</svelte:boundary>

<style>
	:global(body) {
		margin: 0;
		background: #000;
	}
</style>
