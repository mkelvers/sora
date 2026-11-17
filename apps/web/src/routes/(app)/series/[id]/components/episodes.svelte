<script lang="ts" module>
	export const pageSize = 24;
	const tail = 12;
</script>

<script lang="ts">
	import Button from "$lib/components/ui/button.svelte";
	import Sheet from "$lib/components/ui/sheet.svelte";
	import { markEpisode } from "$routes/(app)/series/[id]/series.remote";
	import type { FranchisePart, Progress, Series } from "@sora/sdk";

	import EpisodePage from "./episode-page.svelte";
	import Special from "./special.svelte";

	let {
		series,
		progress,
		specials,
	}: {
		series: Series;
		progress: Progress[];
		specials: FranchisePart[];
	} = $props();

	const played = $derived(new Map(progress.map((entry) => [entry.episode, entry])));
	let steps = $state(1);
	let grid = $state<HTMLOListElement>();
	let columns = $state(1);

	$effect(() => {
		if (!grid) {
			return;
		}
		const element = grid;
		const observer = new ResizeObserver(
			() => (columns = getComputedStyle(element).gridTemplateColumns.split(" ").length),
		);
		observer.observe(element);
		return () => observer.disconnect();
	});

	const stop = (target: number) =>
		series.episode_count - target <= tail ? series.episode_count : target;
	const stops = $derived.by(() => {
		const list = [stop(pageSize)];
		for (let step = 1; step <= steps; step += 1) {
			const end = stop(Math.ceil((pageSize * step) / columns) * columns);
			if (end > (list.at(-1) ?? 0)) {
				list.push(end);
			}
		}
		return list;
	});
	const chunks = $derived(
		stops.map((end, index) => {
			const offset = stops[index - 1] ?? 0;
			return {
				limit: end - offset,
				offset,
			};
		}),
	);
	const loaded = $derived(stops.at(-1) ?? 0);
	let selected = $state<{
		seriesId: string;
		episode: number;
		watched: boolean;
	} | null>(null);

	const mark = () => {
		if (selected === null) {
			return;
		}
		const { episode, seriesId, watched } = selected;
		selected = null;
		markEpisode({
			episode,
			seriesId,
			watched: !watched,
		});
	};
</script>

<ol
	bind:this={grid}
	class="grid grid-cols-1 gap-x-3 gap-y-5 sm:grid-cols-2 sm:gap-x-4 sm:gap-y-8 md:grid-cols-3 lg:grid-cols-4 lg:gap-x-7.5 wide:grid-cols-5 hero:grid-cols-7"
>
	{#each chunks as chunk (chunk.offset)}
		<EpisodePage
			{series}
			offset={chunk.offset}
			limit={chunk.limit}
			{played}
			selected={selected?.seriesId === series.id ? selected.episode : null}
			onoptions={(episode) =>
				(selected = {
					episode,
					seriesId: series.id,
					watched: !!played.get(episode)?.finished,
				})}
		/>
	{/each}
	{#if loaded >= series.episode_count}
		{#each specials as part (part.series_id)}
			<Special
				{part}
				selected={selected?.seriesId === part.series_id ? selected.episode : null}
				onoptions={(episode, watched) =>
					(selected = {
						episode,
						seriesId: part.series_id,
						watched,
					})}
			/>
		{/each}
	{/if}
</ol>

{#if loaded < series.episode_count}
	<Button
		variant="ghost"
		class="mx-auto mt-8 flex h-11 w-full max-w-5xl bg-[#213944] text-foreground hover:bg-[#2f5161]"
		onclick={() => (steps += 1)}
	>
		Show More
	</Button>
{/if}

<Sheet
	bind:open={() => selected !== null, (open) => !open && (selected = null)}
	id="episode-options"
	title="Options"
>
	<Button variant="item" onclick={mark}>
		Mark as {selected?.watched ? "Unwatched" : "Watched"}
	</Button>
</Sheet>
