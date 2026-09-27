<script lang="ts">
	import { untrack } from 'svelte';
	import Poster from '$lib/components/Poster.svelte';
	import Carousel from '$lib/components/ui/Carousel.svelte';
	import Details from './_components/Details.svelte';
	import Episodes from './_components/Episodes.svelte';
	import Hero from './_components/Hero.svelte';
	import Seasons from './_components/Seasons.svelte';
	import { getSeries, getViewing } from './series.remote';
	import type { PageProps } from './$types';

	let {
		params,
	}: PageProps = $props();

	const series = $derived(await getSeries(params.id));
	const viewing = $derived(await getViewing(params.id));
	let season = $derived.by(() => {
		const resume = untrack(() => viewing.resume);
		return series.seasons.find((season) => season.id === resume?.season_id) ?? series.seasons[0];
	});
</script>

<svelte:head>
	<title>{series.title} · Sora</title>
</svelte:head>

<main class="bg-canvas text-foreground">
	{#if season}
		<Hero
			{series}
			{season}
			resume={viewing.resume}
			library={viewing.library}
			seasonWatched={viewing.progress.completed_seasons.some((completion) => completion.season_id === season?.id)}
		/>
	{/if}

	<Details {series} />

	<div class="px-5 sm:px-10 lg:px-16">
		{#if season}
			<section class="py-7 sm:pb-12 lg:pb-16" aria-labelledby="episodes">
				<div class="mb-6 flex flex-wrap items-center justify-between gap-4">
					<h2 id="episodes" class={series.seasons.length > 1 ? 'sr-only' : 'text-lg font-bold'}>Episodes</h2>
					{#if series.seasons.length > 1}
						<Seasons seasons={series.seasons} bind:season />
					{/if}
				</div>

				<Episodes
					seriesId={series.id}
					title={series.title}
					backdrop={series.backdrop_url}
					{season}
					progress={viewing.progress}
				/>
			</section>
		{/if}
	</div>

	{#if series.related.length}
		<section class="pb-10 sm:pb-12 lg:pb-16" aria-labelledby="related">
			<h2 id="related" class="mb-5 px-5 text-xl font-bold sm:px-10 sm:text-2xl lg:px-16">Related</h2>
			<Carousel controls class="min-w-0">
				{#snippet children()}
					<div class="scrollbar-hidden flex gap-3 overscroll-x-contain px-5 pt-2 pb-4 sm:gap-4 sm:px-10 lg:gap-7.5 lg:px-16">
						{#each series.related as card (card.id)}
							<div class="min-w-0 shrink-0 grow-0 basis-[calc((100vw-2.75rem)/2)] sm:basis-[calc((100vw-7.75rem)/4)] lg:basis-[calc((100vw-17.375rem)/5)] 2xl:basis-[calc((100vw-19.25rem)/6)] hero:basis-[calc((100vw-16.875rem)/7)]">
								<Poster {card} />
							</div>
						{/each}
					</div>
				{/snippet}
			</Carousel>
		</section>
	{/if}
</main>
