<script lang="ts">
	import Poster from "$lib/components/Poster.svelte";
	import Carousel from "$lib/components/ui/carousel/Carousel.svelte";
	import Content from "$lib/components/ui/carousel/Content.svelte";
	import Item from "$lib/components/ui/carousel/Item.svelte";
	import Next from "$lib/components/ui/carousel/Next.svelte";
	import Previous from "$lib/components/ui/carousel/Previous.svelte";
	import { getWatchlist } from "$lib/watchlist.remote";

	import type { PageProps } from "./$types";
	import ContinueWatching from "./components/ContinueWatching.svelte";
	import Hero from "./components/Hero.svelte";
	import { getContinueWatching } from "./home.remote";

	let { data }: PageProps = $props();

	const continuing = $derived(getContinueWatching().current ?? []);

	const { featured, trending, upcoming } = $derived(data);
	const watchlist = getWatchlist();
	const dropped = $derived(
		new Set(
			(watchlist.current ?? [])
				.filter((entry) => entry.status === "dropped")
				.map((entry) => entry.series.id),
		),
	);
	const rows = $derived([
		{
			id: "trending",
			title: "Trending Now",
			hint: undefined,
			cards: trending,
		},
		{
			id: "coming-soon",
			title: "Coming Soon: Add to Your Watchlist",
			hint: "Your new favorite shows from the upcoming season",
			cards: upcoming.filter((title) => !title.returning).map((title) => title.series),
		},
		{
			id: "catch-up",
			title: "Catch Up Before the New Season",
			hint: "Catch up on previous episodes before the new season premiere!",
			cards: upcoming.filter((title) => title.returning).map((title) => title.series),
		},
	]);
</script>

<svelte:head>
	<title>Sora</title>
</svelte:head>

<div class="min-h-dvh bg-canvas text-foreground">
	<h1 class="sr-only">Home</h1>
	<div
		class="grid grid-cols-1 grid-rows-[auto] xl:not-has-[>_.continue-watching-section]:-mb-36 xl:not-has-[>_.continue-watching-section]:[--hero-overlap:9rem] wide:has-[>_.continue-watching-section]:grid-rows-[auto_15rem] wide:has-[>_.continue-watching-section]:pb-8 wide:has-[>_.continue-watching-section]:[--hero-overlap:5rem] hero:has-[>_.continue-watching-section]:grid-rows-[auto_16rem] hero:has-[>_.continue-watching-section]:pb-12 [&>section:first-child]:col-start-1 [&>section:first-child]:row-start-1"
	>
		<Hero {featured} />
		<ContinueWatching items={continuing} />
	</div>

	{#each rows as row (row.id)}
		{@const cards = row.cards.filter((card) => !dropped.has(card.id))}
		{#if cards.length}
			<div class="relative z-20 pb-10 sm:pb-12 lg:pb-16">
				<h2 id={row.id} class="px-5 text-xl font-bold sm:px-10 sm:text-2xl lg:px-20">
					{row.title}
				</h2>
				{#if row.hint}
					<p class="mt-1 px-5 text-sm text-[#8c8c8c] sm:px-10 sm:text-base lg:px-20">
						{row.hint}
					</p>
				{/if}

				<Carousel
					class="mt-5 min-w-0"
					aria-labelledby={row.id}
					options={{
						slidesToScroll: "auto",
						duration: 20,
					}}
				>
					{#snippet children()}
						<Content class="gap-3 pt-2 pb-4 pl-5 sm:gap-4 sm:pl-10 lg:gap-7.5 lg:pl-20 hero:gap-6">
							{#each cards as card (card.id)}
								<Item
									class="basis-[calc((100vw-3.25rem)/2)] last:mr-5 min-[30em]:basis-[calc((100vw-4.5rem)/3)] min-[35.5em]:basis-[calc((100vw-5.25rem)/4)] sm:basis-[calc((100vw-7.75rem)/4)] sm:last:mr-10 md:basis-[calc((100vw-9.75rem)/5)] lg:basis-[calc((100vw-19.375rem)/5)] lg:last:mr-20 2xl:basis-[calc((100vw-21.25rem)/6)] hero:basis-[calc((100vw-18.875rem)/7)]"
								>
									<Poster {card} />
								</Item>
							{/each}
						</Content>
						<Previous class="max-sm:hidden" />
						<Next class="max-sm:hidden" />
					{/snippet}
				</Carousel>
			</div>
		{/if}
	{/each}
</div>
