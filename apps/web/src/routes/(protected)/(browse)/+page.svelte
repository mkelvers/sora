<script lang="ts">
	import Poster from '$lib/components/Poster.svelte';
	import Carousel from '$lib/components/ui/Carousel.svelte';
	import ContinueWatching from './_components/ContinueWatching.svelte';
	import Hero from './_components/Hero.svelte';
	import { getContinueWatching, getFeatured, getRecommendations, getTrending } from './home.remote';

	const [featured, continuing, recommended, trending] = $derived(
		await Promise.all([getFeatured(), getContinueWatching(), getRecommendations(), getTrending()])
	);
	const resumes = $derived(new Map(continuing.map((item) => [item.series.id, item])));
	const rows = $derived([
		{
			id: 'recommended',
			title: 'Recommended for You',
			cards: recommended,
		},
		{
			id: 'trending',
			title: 'Trending Now',
			cards: trending,
		},
	]);
</script>

<svelte:head>
	<title>Sora</title>
</svelte:head>

<main class="min-h-dvh bg-canvas text-foreground">
	<h1 class="sr-only">Home</h1>
	<div
		class="grid grid-cols-1 grid-rows-[auto] wide:has-[>_.continue-watching-section]:grid-rows-[auto_15rem] wide:has-[>_.continue-watching-section]:pb-8 hero:has-[>_.continue-watching-section]:grid-rows-[auto_16rem] hero:has-[>_.continue-watching-section]:pb-12 [&>section:first-child]:col-start-1 [&>section:first-child]:row-start-1"
	>
		<Hero {featured} />
		<ContinueWatching items={continuing} />
	</div>

	{#each rows as row (row.id)}
		{#if row.cards.length}
			<section class="relative z-20 pb-10 sm:pb-12 lg:pb-16" aria-labelledby={row.id}>
				<h2 id={row.id} class="mb-5 px-4 text-xl font-bold sm:px-10 sm:text-2xl lg:px-16">{row.title}</h2>

				<Carousel controls class="min-w-0">
					{#snippet children()}
						<div class="scrollbar-hidden flex gap-3 overscroll-x-contain px-4 pt-2 pb-4 sm:gap-4 sm:px-10 lg:gap-7.5 lg:px-16 hero:gap-6">
							{#each row.cards as card (card.id)}
								<div
									class="min-w-0 shrink-0 grow-0 basis-[calc((100vw-2.75rem)/2)] min-[30em]:basis-[calc((100vw-4rem)/3)] min-[35.5em]:basis-[calc((100vw-4.75rem)/4)] sm:basis-[calc((100vw-7.75rem)/4)] lg:basis-[calc((100vw-17.375rem)/5)] 2xl:basis-[calc((100vw-19.25rem)/6)] hero:basis-[calc((100vw-16.875rem)/7)]"
								>
									<Poster {card} resume={resumes.get(card.id)} />
								</div>
							{/each}
						</div>
					{/snippet}
				</Carousel>
			</section>
		{/if}
	{/each}
</main>
