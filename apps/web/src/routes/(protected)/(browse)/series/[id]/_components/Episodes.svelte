<script lang="ts">
	import Skeleton from "$lib/components/snippets/Skeleton.svelte";
	import { getEpisodes } from "$routes/(protected)/(browse)/series/[id]/series.remote";
	import type { Season, SeriesProgress } from "@sora/sdk";

	import Episode from "./Episode.svelte";

	let {
		seriesId,
		title,
		movie,
		backdrop,
		season,
		progress,
	}: {
		seriesId: string;
		title: string;
		movie: boolean;
		backdrop: string | null;
		season: Season;
		progress: SeriesProgress;
	} = $props();

	const played = $derived(
		new Map(
			progress.episodes.flatMap((entry) =>
				entry.season_id === season.id ? [[entry.episode, entry]] : [],
			),
		),
	);
	const watched = $derived(
		new Set(
			progress.watched.flatMap((entry) => (entry.season_id === season.id ? [entry.episode] : [])),
		),
	);

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
			class="grid grid-cols-1 gap-x-3 gap-y-5 sm:grid-cols-2 sm:gap-x-4 sm:gap-y-8 md:grid-cols-3 lg:grid-cols-4 lg:gap-x-7.5 wide:grid-cols-5 hero:grid-cols-7"
		>
			{#each episodes.current as episode (episode.number)}
				<Episode
					{seriesId}
					seasonId={season.id}
					{title}
					{movie}
					{backdrop}
					{episode}
					progress={played.get(episode.number)}
					watched={watched.has(episode.number)}
				/>
			{/each}
		</ol>
	{/if}
{:else}
	<ol
		class="grid grid-cols-1 gap-x-3 gap-y-5 sm:grid-cols-2 sm:gap-x-4 sm:gap-y-8 md:grid-cols-3 lg:grid-cols-4 lg:gap-x-7.5 wide:grid-cols-5 hero:grid-cols-7"
		aria-busy="true"
		aria-label="Loading episodes"
	>
		{#each { length: Math.min(season.episode_count, 10) }, index (index)}
			<li class="grid grid-cols-[40%_minmax(0,1fr)] content-start gap-x-3 sm:block sm:min-h-56">
				<Skeleton class="row-span-3 aspect-video" />
				<Skeleton class="h-3 w-3/4 sm:mt-3" />
				<Skeleton class="mt-2 h-4 w-2/5" />
				<Skeleton class="mt-3 h-3 w-1/3" />
			</li>
		{/each}
	</ol>
{/if}
