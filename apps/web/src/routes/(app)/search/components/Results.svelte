<script lang="ts">
	import { navigating } from "$app/state";
	import EmptyState from "$lib/components/EmptyState.svelte";
	import { mascots } from "$lib/mascots";
	import { onVisible } from "$lib/utils";
	import Poster from "$routes/(app)/components/Poster.svelte";
	import { searchSeries } from "$routes/(app)/search/search.remote";

	let {
		q,
		page,
		last,
		onmore,
	}: {
		q: string;
		page: number;
		last: boolean;
		onmore: () => void;
	} = $props();

	const search = $derived(
		searchSeries({
			q,
			page,
			perPage: 24,
		}),
	);
	const found = $derived(await search);
	const stale = $derived(navigating.to?.url.pathname === "/search");

	$effect(() => {
		if (!found.meta.preparing) {
			return;
		}

		const timer = setTimeout(() => search.refresh(), 1000);
		return () => clearTimeout(timer);
	});
</script>

{#each found.results as card (card.id)}
	<li class={["transition-opacity", stale && "opacity-50"]}>
		<Poster {card} />
	</li>
{:else}
	{#if page === 1}
		<li class={["col-span-full grid place-items-center", stale && "opacity-50"]}>
			{#if found.meta.preparing}
				<EmptyState
					mascot={mascots.preparing}
					title="Looking further for “{q}”."
					hint="Some matching titles are still being prepared, they'll show up here as soon as they're done."
				/>
			{:else}
				<EmptyState
					mascot={mascots.emptySearch}
					title="We couldn't find anything for “{q}”."
					hint="Maybe it goes by its English or Japanese title?"
				/>
			{/if}
		</li>
	{/if}
{/each}

{#if last && found.meta.has_next_page}
	<li class="col-span-full h-px" aria-hidden="true" {@attach onVisible(onmore, "800px 0px")}></li>
{/if}
