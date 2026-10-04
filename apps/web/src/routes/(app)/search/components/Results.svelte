<script lang="ts">
	import { navigating } from "$app/state";
	import EmptyState from "$lib/components/EmptyState.svelte";
	import { mascots } from "$lib/mascots";
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

	const found = $derived(
		await searchSeries({
			q,
			page,
			perPage: 24,
		}),
	);
	const stale = $derived(navigating.to?.url.pathname === "/search");

	$effect(() => {
		if (!found.meta.preparing) {
			return;
		}

		const timer = setTimeout(
			() =>
				searchSeries({
					q,
					page,
					perPage: 24,
				}).refresh(),
			1000,
		);

		return () => clearTimeout(timer);
	});
</script>

{#each found.results as card (card.id)}
	<li class={["transition-opacity", stale && "opacity-50"]}>
		<Poster {card} />
	</li>
{:else}
	{#if page === 1}
		{#if found.meta.preparing}
			<li class={["col-span-full grid place-items-center", stale && "opacity-50"]}>
				<div class="w-full max-w-5xl">
					<h2 class="mb-8 text-center text-2xl font-bold">Looking further for “{q}”…</h2>
					<EmptyState
						mascot={mascots.preparing}
						title="Some matching titles are still being prepared."
						hint="They'll show up here as soon as they're done."
					/>
				</div>
			</li>
		{:else}
			<li class={["col-span-full grid place-items-center", stale && "opacity-50"]}>
				<div class="w-full max-w-5xl">
					<h2 class="mb-8 text-center text-2xl font-bold">Are you sure you spelled that right?</h2>
					<EmptyState
						mascot={mascots.emptySearch}
						title="We couldn't find anything for “{q}”."
						hint="Maybe it goes by its English or Japanese title?"
					/>
				</div>
			</li>
		{/if}
	{/if}
{/each}

{#if last && found.meta.has_next_page}
	<li
		class="col-span-full h-px"
		aria-hidden="true"
		{@attach (node) => {
			const observer = new IntersectionObserver(
				(entries) => {
					if (entries.some((entry) => entry.isIntersecting)) {
						onmore();
					}
				},
				{ rootMargin: "800px 0px" },
			);

			observer.observe(node);
			return () => observer.disconnect();
		}}
	></li>
{/if}
