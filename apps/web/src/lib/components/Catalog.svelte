<script lang="ts">
	import emptySearch from "$lib/assets/illustrations/empty-search.webp";
	import { getCatalogPage, type CatalogRequest } from "$lib/catalog.remote";
	import EmptyState from "$lib/components/EmptyState.svelte";
	import Poster from "$lib/components/Poster.svelte";
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
		empty: string;
		controls: Snippet;
		summary?: Snippet;
	} = $props();

	let count = $state(1);

	const pages = $derived(
		await Promise.all(
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
		),
	);
	const items = $derived.by(() => {
		const seen = new Set<string>();
		return pages
			.flatMap((page) => page.items)
			.filter((item) => !seen.has(item.key) && !!seen.add(item.key));
	});
	const resumes = $derived(Object.assign({}, ...pages.map((page) => page.resumes)));
	const hasNextPage = $derived(pages.at(-1)?.hasNextPage ?? false);
	const loadedAt = $derived(Date.parse(pages[0].loadedAt));

	const day = 24 * 60 * 60 * 1000;
	const sections = $derived.by(() => {
		if (request.kind !== "new") {
			return [
				{
					id: "catalog-results",
					title: request.kind === "popular" ? "Popular" : title,
					hidden: request.kind !== "popular",
					items,
				},
			];
		}

		const age = (item: (typeof items)[number]) =>
			Math.max(0, loadedAt - Date.parse(item.release?.released_at ?? pages[0].loadedAt));

		return [
			{
				id: "last-24-hours",
				title: "Last 24 Hours",
				hidden: false,
				items: items.filter((item) => age(item) < day),
			},
			{
				id: "this-past-week",
				title: "This Past Week",
				hidden: false,
				items: items.filter((item) => age(item) >= day && age(item) < 7 * day),
			},
			{
				id: "earlier",
				title: "Earlier",
				hidden: false,
				items: items.filter((item) => age(item) >= 7 * day),
			},
		].filter((section) => section.items.length);
	});

	const relativeTime = new Intl.RelativeTimeFormat("en", {
		numeric: "always",
	});

	const released = (releasedAt: string) => {
		const minutes = Math.floor(Math.max(0, loadedAt - Date.parse(releasedAt)) / 60_000);
		if (minutes < 60) {
			return relativeTime.format(-Math.max(1, minutes), "minute");
		}

		const hours = Math.floor(minutes / 60);
		return hours < 24
			? relativeTime.format(-hours, "hour")
			: relativeTime.format(-Math.floor(hours / 24), "day");
	};

	$effect(() => {
		const waiting = pages.flatMap((page, index) => (page.preparing ? [index + 1] : []));
		if (waiting.length === 0) {
			return;
		}

		const timer = setTimeout(() => {
			for (const page of waiting) {
				getCatalogPage({
					...request,
					page,
				}).refresh();
			}
		}, 1000);

		return () => clearTimeout(timer);
	});
</script>

<div
	class="min-h-dvh overflow-x-clip bg-canvas px-5 py-10 text-foreground sm:px-10 sm:py-12 lg:px-16 lg:py-16"
>
	<section class="mx-auto w-full max-w-264" aria-labelledby="catalog-title">
		<div class="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
			<div class="flex flex-col items-start">
				<h1 id="catalog-title" class="text-xl font-bold sm:text-2xl">{title}</h1>
				{@render summary?.()}
			</div>
			{@render controls()}
		</div>

		{#each sections as section (section.id)}
			<section class="mb-12" aria-labelledby={section.id}>
				<h2 id={section.id} class={section.hidden ? "sr-only" : "mb-4 text-base font-bold"}>
					{section.title}
				</h2>
				<ul
					class="grid grid-cols-2 items-start gap-x-3 gap-y-8 sm:grid-cols-3 sm:gap-x-4 md:grid-cols-4 lg:grid-cols-5 lg:gap-x-7.5 lg:gap-y-12 xl:grid-cols-6"
				>
					{#each section.items as item (item.key)}
						<li class="[&_a>h3]:line-clamp-none [&_h3]:min-h-0">
							{#if item.preparing}
								<Poster title={item.preparing.title} />
							{:else if item.card}
								<Poster
									card={item.card}
									resume={resumes[item.card.id]}
									meta={item.release && released(item.release.released_at)}
								/>
							{/if}
						</li>
					{/each}
				</ul>
			</section>
		{/each}

		{#if !items.length && !hasNextPage}
			{#if pages.some((page) => page.preparing)}
				<p class="py-16 text-center text-muted">Getting these titles ready…</p>
			{:else}
				<EmptyState
					image={emptySearch}
					alt="Sora's mascot squinting at a poster card next to a tipped-over box"
					width={720}
					height={663}
					title={empty}
					hint="Try another filter or check back later."
				/>
			{/if}
		{/if}

		{#if hasNextPage}
			<div
				class="flex min-h-24 items-center justify-center"
				aria-live="polite"
				{@attach (node) => {
					const loaded = pages.length;
					const observer = new IntersectionObserver(
						(entries) => {
							if (entries.some((entry) => entry.isIntersecting) && loaded === count) {
								count += 1;
							}
						},
						{ rootMargin: "600px 0px" },
					);

					observer.observe(node);
					return () => observer.disconnect();
				}}
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
		{/if}
	</section>
</div>
