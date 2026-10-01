<script lang="ts">
	import { page } from "$app/state";
	import Select from "$lib/components/ui/Select.svelte";

	import type { PageProps } from "./$types";
	import Details from "./_components/Details.svelte";
	import Episodes from "./_components/Episodes.svelte";
	import Hero from "./_components/Hero.svelte";
	import { getSeries } from "./series.remote";

	let { params }: PageProps = $props();

	const series = $derived(await getSeries(params.id));
	let season = $derived(
		series.seasons.find((season) => season.id === page.state.seasonId) ?? series.seasons[0],
	);
	const seasonOptions = $derived(
		series.seasons.map((other) => ({
			value: other.id,
			label: other.title,
			detail: other.episode_count === 1 ? "1 Episode" : `${other.episode_count} Episodes`,
		})),
	);
</script>

<svelte:head>
	<title>{series.title} · Sora</title>
</svelte:head>

<div class="bg-canvas text-foreground">
	<Hero {series} />

	<Details {series} />

	<div class="px-5 sm:px-10 lg:px-16">
		{#if season}
			<section class="py-7 sm:pb-12 lg:pb-16" aria-labelledby="episodes">
				<div class="mb-6 flex flex-wrap items-center justify-between gap-4">
					<h2 id="episodes" class={series.seasons.length > 1 ? "sr-only" : "text-lg font-bold"}>
						{#if series.seasons.length > 1}
							Episodes
						{:else}
							{series.title}
						{/if}
					</h2>
					{#if series.seasons.length > 1}
						<Select
							variant="heading"
							label="Season"
							options={seasonOptions}
							bind:value={
								() => season.id,
								(id) => (season = series.seasons.find((other) => other.id === id) ?? season)
							}
						/>
					{/if}
				</div>

				<Episodes
					seriesId={series.id}
					title={series.title}
					movie={series.kind === "movie"}
					backdrop={series.backdrop_url}
					{season}
				/>
			</section>
		{:else}
			<section
				class="my-7 border-2 border-dotted border-muted px-5 py-14 text-center sm:mb-12 lg:mb-16"
				aria-labelledby="check-back"
			>
				<h2 id="check-back" class="text-xl font-bold">Check Back Soon!</h2>
				<p class="mt-2 text-sm text-subtle">In the meantime, feel free to take a look around.</p>
			</section>
		{/if}
	</div>
</div>
