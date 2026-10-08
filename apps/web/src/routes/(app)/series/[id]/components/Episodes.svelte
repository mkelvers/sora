<script lang="ts">
	import Skeleton from "$lib/components/snippets/Skeleton.svelte";
	import { getEpisodes } from "$routes/(app)/series/[id]/series.remote";
	import type { Progress, Series } from "@sora/sdk";

	import Episode from "./Episode.svelte";

	let {
		series,
		progress,
	}: {
		series: Series;
		progress: Progress[];
	} = $props();

	const played = $derived(new Map(progress.map((entry) => [entry.episode, entry])));
	const episodes = $derived(getEpisodes(series.id));

	$effect(() => {
		if (!episodes.current?.some((episode) => episode.audio === null)) {
			return;
		}

		const timer = setTimeout(() => episodes.refresh(), 3000);
		return () => clearTimeout(timer);
	});
</script>

<ol
	class="grid grid-cols-1 gap-x-3 gap-y-5 sm:grid-cols-2 sm:gap-x-4 sm:gap-y-8 md:grid-cols-3 lg:grid-cols-4 lg:gap-x-7.5 wide:grid-cols-5 hero:grid-cols-7"
	aria-busy={!episodes.current}
>
	{#if episodes.current}
		{#each episodes.current as episode (episode.number)}
			<Episode {series} {episode} progress={played.get(episode.number)} />
		{/each}
	{:else}
		{#each { length: Math.min(series.episode_count, 10) }, index (index)}
			<li class="grid grid-cols-[40%_minmax(0,1fr)] content-start gap-x-3 sm:block sm:min-h-56">
				<Skeleton class="row-span-3 aspect-video" />
				<Skeleton class="h-3 w-3/4 sm:mt-3" />
				<Skeleton class="mt-2 h-4 w-2/5" />
				<Skeleton class="mt-3 h-3 w-1/3" />
			</li>
		{/each}
	{/if}
</ol>
