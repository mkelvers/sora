<script lang="ts">
	import Episode from "./Episode.svelte";
	import Skeleton from "$lib/components/snippets/Skeleton.svelte";
	import { getEpisodes } from "../series.remote";
	import type { Season, TitleProgress } from "@sora/sdk";

	type Props = {
		seriesId: string;
		season: Season;
		progress: TitleProgress;
	};

	let {
		seriesId,
		season,
		progress,
	}: Props = $props();

	const episodes = $derived(
		getEpisodes({
			seriesId,
			seasonId: season.id,
		}),
	);
	let now = $state(new Date());

	$effect(() => {
		if (!episodes.current?.some((episode) => episode.audio === null)) {
			return;
		}

		const timer = setTimeout(() => episodes.refresh(), 3000);

		return () => clearTimeout(timer);
	});

	$effect(() => {
		const timeout = setTimeout(
			() => (now = new Date()),
			60_000 - (now.getTime() % 60_000),
		);
		return () => clearTimeout(timeout);
	});
</script>

{#if episodes.current}
	<ol>
		{#each episodes.current as episode (episode.number)}
			<Episode
				{seriesId}
				seasonId={season.id}
				{episode}
				{now}
				checkpoint={progress.episodes.find(
					(checkpoint) =>
						checkpoint.season_id === season.id &&
						checkpoint.episode === episode.number,
				)}
			/>
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
					{#each ["45%", "12%", "90%", "75%"] as width, line (line)}
						<Skeleton variant="text" {width} />
					{/each}
				</div>
			</li>
		{/each}
	</ol>
{/if}

<style>
	ol {
		display: grid;
		gap: 12px;
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
		grid-template-columns: minmax(160px, 3fr) minmax(0, 5fr);
		align-items: center;
		gap: 24px;
		padding-right: 72px;
	}

	.lines {
		display: grid;
		gap: 10px;
		max-width: 70ch;
	}
</style>
