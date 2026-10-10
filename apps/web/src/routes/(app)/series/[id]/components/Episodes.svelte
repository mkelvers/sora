<script lang="ts">
	import Button from "$lib/components/ui/Button.svelte";
	import Sheet from "$lib/components/ui/Sheet.svelte";
	import { markEpisode } from "$routes/(app)/series/[id]/series.remote";
	import type { Progress, Series } from "@sora/sdk";

	import EpisodePage from "./EpisodePage.svelte";

	let {
		series,
		progress,
	}: {
		series: Series;
		progress: Progress[];
	} = $props();

	const played = $derived(new Map(progress.map((entry) => [entry.episode, entry])));
	const minimum = 24;
	let perPage = $state<number | null>(null);
	let steps = $state(1);

	const chunks = $derived.by(() => {
		if (perPage === null) {
			return [];
		}

		const list: { offset: number; limit: number }[] = [];
		for (let step = 0; step < steps; step++) {
			const offset = step * perPage;
			const rest = series.episode_count - offset;
			list.push({
				offset,
				limit: rest - perPage < perPage ? rest : perPage,
			});
		}
		return list;
	});
	const loaded = $derived(chunks.reduce((count, chunk) => count + chunk.limit, 0));
	let selected = $state<number | null>(null);
	const watched = $derived(selected !== null && !!played.get(selected)?.finished);

	function mark() {
		if (selected === null) return;
		const episode = selected;
		const finished = watched;
		selected = null;
		markEpisode({
			seriesId: series.id,
			episode,
			watched: !finished,
		});
	}
</script>

<ol
	class="grid grid-cols-1 gap-x-3 gap-y-5 sm:grid-cols-2 sm:gap-x-4 sm:gap-y-8 md:grid-cols-3 lg:grid-cols-4 lg:gap-x-7.5 wide:grid-cols-5 hero:grid-cols-7"
	aria-busy={perPage === null}
	{@attach (node) => {
		const columns = getComputedStyle(node).gridTemplateColumns.split(" ").length;
		perPage = columns * Math.ceil(minimum / columns);
	}}
>
	{#if perPage !== null}
		{#each chunks as chunk (chunk.offset)}
			<EpisodePage
				{series}
				offset={chunk.offset}
				limit={chunk.limit}
				{played}
				{selected}
				onoptions={(episode) => (selected = episode)}
			/>
		{/each}
	{/if}
</ol>

{#if chunks.length && loaded < series.episode_count}
	<Button
		variant="ghost"
		class="mx-auto mt-8 flex h-11 w-full max-w-5xl bg-[#213944] text-foreground hover:bg-[#2f5161]"
		onclick={() => steps++}
	>
		Show More
	</Button>
{/if}

<Sheet
	bind:open={() => selected !== null, (open) => !open && (selected = null)}
	id="episode-options"
	title="Options"
>
	<Button variant="item" onclick={mark}>Mark as {watched ? "Unwatched" : "Watched"}</Button>
</Sheet>
