<script lang="ts">
	import { untrack } from "svelte";

	import type { PageProps } from "./$types";
	import Details from "./_components/Details.svelte";
	import Episodes from "./_components/Episodes.svelte";
	import Hero from "./_components/Hero.svelte";
	import Seasons from "./_components/Seasons.svelte";
	import { getSeries, getViewing } from "./series.remote";

	let { params }: PageProps = $props();

	const seriesQuery = $derived(getSeries(params.id));
	const viewingQuery = $derived(getViewing(params.id));
	const series = $derived(await seriesQuery);
	const viewing = $derived(await viewingQuery);
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
			seasonWatched={viewing.progress.completed_seasons.some(
				(completion) => completion.season_id === season?.id,
			)}
		/>
	{/if}

	<Details {series} />

	<div class="px-5 sm:px-10 lg:px-16">
		{#if season}
			<section class="py-7 sm:pb-12 lg:pb-16" aria-labelledby="episodes">
				<div class="mb-6 flex flex-wrap items-center justify-between gap-4">
					<h2 id="episodes" class={series.seasons.length > 1 ? "sr-only" : "text-lg font-bold"}>
						{series.seasons.length > 1 ? "Episodes" : series.title}
					</h2>
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
</main>
