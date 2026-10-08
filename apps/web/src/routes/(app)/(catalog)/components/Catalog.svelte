<script lang="ts">
	import EmptyState from "$lib/components/EmptyState.svelte";
	import { mascots } from "$lib/mascots";
	import { onVisible } from "$lib/utils";
	import { getCatalogPage, type CatalogRequest } from "$routes/(app)/(catalog)/catalog.remote";
	import Poster from "$routes/(app)/components/Poster.svelte";
	import { CircleNotchIcon } from "phosphor-svelte";
	import type { Snippet } from "svelte";

	let {
		request,
		title,
		empty,
		controls,
		summary,
	}: {
		request: CatalogRequest;
		title: string;
		empty: {
			title: string;
			hint: string;
		};
		controls: Snippet;
		summary?: Snippet;
	} = $props();

	let count = $state(1);

	const queries = $derived(
		Array.from(
			{
				length: count,
			},
			(_, index) =>
				getCatalogPage({
					...request,
					page: index + 1,
				}),
		),
	);
	const pages = $derived(await Promise.all(queries));
	const items = $derived.by(() => {
		const seen = new Set<string>();
		return pages
			.flatMap((page) => page.items)
			.filter((item) => !seen.has(item.card.id) && !!seen.add(item.card.id));
	});
	const hasNextPage = $derived(pages.at(-1)?.hasNextPage ?? false);
	const sections = $derived([...Map.groupBy(items, (item) => item.group)]);

	$effect(() => {
		const waiting = queries.filter((_, index) => pages[index]?.preparing);
		if (!waiting.length) {
			return;
		}

		const timer = setTimeout(() => waiting.forEach((query) => query.refresh()), 1000);
		return () => clearTimeout(timer);
	});
</script>

<div class="page overflow-x-clip">
	<section class="mx-auto w-full max-w-264" aria-labelledby="catalog-title">
		<div class="mb-8 flex items-center justify-between gap-2 sm:gap-4">
			<div class="flex flex-col items-start">
				<h1 id="catalog-title" class="text-2xl font-bold">{title}</h1>
				{@render summary?.()}
			</div>
			{@render controls()}
		</div>

		{#each sections as [group, entries], index (group)}
			<section class="mb-12" aria-labelledby="catalog-section-{index}">
				<h2 id="catalog-section-{index}" class={group ? "mb-4 text-lg font-bold" : "sr-only"}>
					{group ?? title}
				</h2>
				<ul
					class="grid grid-cols-2 items-start gap-x-3 gap-y-8 sm:grid-cols-3 sm:gap-x-4 md:grid-cols-4 lg:grid-cols-5 lg:gap-x-7.5 lg:gap-y-12 xl:grid-cols-6"
				>
					{#each entries as item (item.card.id)}
						<li class="[&_a>h3]:line-clamp-none [&_h3]:min-h-0">
							<Poster card={item.card} meta={item.meta} />
						</li>
					{/each}
				</ul>
			</section>
		{/each}

		{#if !items.length && !hasNextPage}
			{#if pages.some((page) => page.preparing)}
				<EmptyState
					mascot={mascots.preparing}
					title="We're getting these titles ready."
					hint="They'll show up here as soon as they're done."
				/>
			{:else}
				<EmptyState mascot={mascots.emptySearch} title={empty.title} hint={empty.hint} />
			{/if}
		{/if}

		{#if hasNextPage}
			{#key pages.length}
				<div
					class="flex min-h-24 items-center justify-center"
					aria-live="polite"
					{@attach onVisible(() => {
						if (pages.length === count) {
							count += 1;
						}
					}, "600px 0px")}
				>
					{#if pages.length < count}
						<CircleNotchIcon
							size="2rem"
							weight="bold"
							class="animate-spin text-accent motion-reduce:animate-none"
							role="status"
							aria-label="Loading more anime"
						/>
					{:else}
						<span class="sr-only">More anime load automatically while scrolling.</span>
					{/if}
				</div>
			{/key}
		{/if}
	</section>
</div>
