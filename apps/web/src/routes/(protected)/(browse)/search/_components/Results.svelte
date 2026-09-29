<script lang="ts">
	import { navigating } from "$app/state";
	import emptySearch from "$lib/assets/illustrations/empty-search.webp";
	import EmptyState from "$lib/components/EmptyState.svelte";
	import Poster from "$lib/components/Poster.svelte";
	import type { PreparingTitle, SeriesCard } from "@sora/sdk";

	import { searchSeries } from "../search.remote";

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

	const items = $derived.by(() => {
		const merged: (
			| {
					key: string;
					card: SeriesCard;
					preparing?: never;
			  }
			| {
					key: string;
					preparing: PreparingTitle;
					card?: never;
			  }
		)[] = found.results.map((card) => ({
			key: card.id,
			card,
		}));

		for (const preparing of found.meta.preparing_titles.toSorted(
			(left, right) => left.position - right.position,
		)) {
			merged.splice(Math.min(preparing.position, merged.length), 0, {
				key: `anilist:${preparing.anilist_id}`,
				preparing,
			});
		}

		return merged;
	});

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

{#each items as { key, card, preparing } (key)}
	<li class={["transition-opacity", stale && "opacity-50"]}>
		{#if preparing}
			<Poster title={preparing.title} />
		{:else if card}
			<Poster {card} resume={found.resumes[card.id]} />
		{/if}
	</li>
{:else}
	{#if page === 1}
		{#if found.meta.preparing}
			<li class={["col-span-full py-16 text-center", stale && "opacity-50"]}>
				<p class="text-xl font-bold">Looking further for “{q}”…</p>
				<p class="mt-2 text-muted">Some matching titles are still being prepared.</p>
			</li>
		{:else}
			<li
				class={[
					"col-span-full grid min-h-[calc(100dvh-14rem)] place-items-center sm:min-h-[calc(100dvh-11rem)]",
					stale && "opacity-50",
				]}
			>
				<div class="w-full max-w-5xl">
					<h2 class="mb-8 text-center text-2xl font-bold">Are you sure you spelled that right?</h2>
					<EmptyState
						image={emptySearch}
						width={720}
						height={663}
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
