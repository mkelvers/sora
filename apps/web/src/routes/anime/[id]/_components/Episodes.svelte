<script lang="ts">
	import Episode from './Episode.svelte';
	import { episodesSkeleton } from './episodes-skeleton.svelte';
	import { getEpisodes } from '../anime.remote';
	import type { Season } from '@sora/sdk';

	type Props = {
		seriesId: string;
		season: Season;
	};

	let { seriesId, season }: Props = $props();
</script>

{#if getEpisodes({ seriesId, seasonId: season.id }).current}
	<ol>
		{#each getEpisodes({ seriesId, seasonId: season.id }).current as episode (episode.number)}
			<Episode {episode} />
		{:else}
			<li class="empty">No episodes yet.</li>
		{/each}
	</ol>
{:else}
	{@render episodesSkeleton(season.episode_count)}
{/if}

<style>
	ol {
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.empty {
		display: block;
		color: #999;
	}
</style>
