<script lang="ts">
	import Player from "./_components/Player.svelte";
	import { getEpisode } from "./watch.remote";
	import type { PageProps } from "./$types";

	let { params }: PageProps = $props();
</script>

<svelte:boundary>
	{@const { series, season, episode } = await getEpisode({
		seriesId: params.id,
		seasonId: params.seasonId,
		episode: params.episode,
	})}

	{#key `${params.seasonId}/${params.episode}`}
		<Player
			seriesId={series.id}
			seasonId={season.id}
			episode={episode.number}
			episodeCount={season.episode_count}
			series={series.title}
			season={season.title}
			title={episode.title ?? `Episode ${episode.number}`}
		/>
	{/key}
</svelte:boundary>
