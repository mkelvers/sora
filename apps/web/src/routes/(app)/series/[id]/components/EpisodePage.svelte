<script lang="ts">
	import Skeleton from "$lib/components/snippets/Skeleton.svelte";
	import { getEpisodes } from "$routes/(app)/series/[id]/series.remote";
	import type { Progress, Series } from "@sora/sdk";

	import Episode from "./Episode.svelte";

	let {
		series,
		page,
		perPage,
		played,
		selected,
		onoptions,
	}: {
		series: Series;
		page: number;
		perPage: number;
		played: Map<number, Progress>;
		selected: number | null;
		onoptions: (episode: number) => void;
	} = $props();

	const episodes = $derived(
		getEpisodes({
			id: series.id,
			page,
			perPage,
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
	{#each episodes.current as episode (episode.number)}
		<Episode
			{series}
			{episode}
			progress={played.get(episode.number)}
			options={selected === episode.number}
			onoptions={() => onoptions(episode.number)}
		/>
	{/each}
{:else}
	{#each { length: Math.min(perPage, series.episode_count - (page - 1) * perPage) }, index (index)}
		<li class="grid grid-cols-[40%_minmax(0,1fr)] content-start gap-x-3 sm:block sm:min-h-56">
			<Skeleton class="row-span-3 aspect-video" />
			<Skeleton class="h-3 w-3/4 sm:mt-3" />
			<Skeleton class="mt-2 h-4 w-2/5" />
			<Skeleton class="mt-3 h-3 w-1/3" />
		</li>
	{/each}
{/if}
