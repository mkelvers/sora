<script lang="ts">
	import Skeleton from "$lib/components/snippets/Skeleton.svelte";
	import type { Season, TitleProgress } from "@sora/sdk";

	import { getEpisodes } from "../series.remote";
	import Episode from "./Episode.svelte";

	let {
		seriesId,
		title,
		backdrop,
		season,
		progress,
	}: {
		seriesId: string;
		title: string;
		backdrop: string | null;
		season: Season;
		progress: TitleProgress;
	} = $props();

	const episodes = $derived(
		getEpisodes({
			seriesId,
			seasonId: season.id,
		}),
	);

	$effect(() => {
		if (!episodes.current?.some((episode) => episode.audio === null)) {
			return;
		}

		const timer = setTimeout(() => episodes.refresh(), 3000);

		return () => clearTimeout(timer);
	});
</script>

{#if episodes.current}
	{#if episodes.current.length}
		<ol
			class="grid grid-cols-1 gap-x-5 gap-y-8 sm:grid-cols-2 md:grid-cols-4 wide:grid-cols-6 hero:grid-cols-7"
		>
			{#each episodes.current as episode (episode.number)}
				<Episode
					{seriesId}
					seasonId={season.id}
					{title}
					{backdrop}
					{episode}
					checkpoint={progress.episodes.find(
						(checkpoint) =>
							checkpoint.season_id === season.id && checkpoint.episode === episode.number,
					)}
				/>
			{/each}
		</ol>
	{:else}
		<p class="py-10 text-muted">No episodes yet.</p>
	{/if}
{:else}
	<ol
		class="grid grid-cols-1 gap-x-5 gap-y-8 sm:grid-cols-2 md:grid-cols-4 wide:grid-cols-6 hero:grid-cols-7"
		aria-busy="true"
		aria-label="Loading episodes"
	>
		{#each { length: Math.min(season.episode_count, 10) }, index (index)}
			<li class="min-h-56">
				<Skeleton class="aspect-video" />
				<Skeleton class="mt-3 h-3 w-3/4" />
				<Skeleton class="mt-2 h-4 w-2/5" />
				<Skeleton class="mt-3 h-3 w-1/3" />
			</li>
		{/each}
	</ol>
{/if}
