<script lang="ts">
	import Episode from './Episode.svelte';
	import Skeleton from '$lib/components/snippets/Skeleton.svelte';
	import { getEpisodes } from '../series.remote';
	import type { Season } from '@sora/sdk';

	type Props = {
		seriesId: string;
		season: Season;
	};

	let { seriesId, season }: Props = $props();

	const episodes = $derived(getEpisodes({ seriesId, seasonId: season.id }));
	let now = $state(new Date());

	$effect(() => {
		const timeout = setTimeout(() => (now = new Date()), 60_000 - (now.getTime() % 60_000));
		return () => clearTimeout(timeout);
	});
</script>

{#if episodes.current}
	<ol>
		{#each episodes.current as episode (episode.number)}
			<Episode {seriesId} seasonId={season.id} {episode} {now} />
		{:else}
			<li class="empty">No episodes yet.</li>
		{/each}
	</ol>
{:else}
	<ol aria-busy="true" aria-label="Loading episodes">
		{#each { length: Math.min(season.episode_count, 6) }, index (index)}
			<li class="loading">
				<Skeleton ratio="3 / 2" />
				<div class="lines">
					{#each ['45%', '12%', '90%', '75%'] as width, line (line)}
						<Skeleton variant="text" {width} />
					{/each}
				</div>
			</li>
		{/each}
	</ol>
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

	.loading {
		display: grid;
		grid-template-columns: minmax(160px, 375px) minmax(0, 1fr);
		align-items: center;
		gap: 24px;
		padding: 10px 0;
	}

	.lines {
		display: grid;
		gap: 10px;
		max-width: 70ch;
	}
</style>
