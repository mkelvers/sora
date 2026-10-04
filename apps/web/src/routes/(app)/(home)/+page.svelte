<script lang="ts">
	import PosterRow from "$lib/components/PosterRow.svelte";
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
		<PosterRow
			id={row.id}
			title={row.title}
			hint={row.hint}
			cards={row.cards.filter((card) => !dropped.has(card.id))}
		/>
	{/each}
</div>
