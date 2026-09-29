<script lang="ts">
	import { page } from "$app/state";
	import Button from "$lib/components/ui/Button.svelte";
	import Dropdown from "$lib/components/ui/Dropdown.svelte";
	import Select from "$lib/components/ui/Select.svelte";
	import { tmdbImage } from "$lib/utils";
	import { DotsThreeVerticalIcon } from "phosphor-svelte";
	import { untrack } from "svelte";

	import type { PageProps } from "./$types";
	import Details from "./_components/Details.svelte";
	import Episodes from "./_components/Episodes.svelte";
	import Hero from "./_components/Hero.svelte";
	import { getSeries, getViewing, markAllWatched } from "./series.remote";

	let { params }: PageProps = $props();

	const seriesQuery = $derived(getSeries(params.id));
	const viewingQuery = $derived(getViewing(params.id));
	const series = $derived(await seriesQuery);
	const viewing = $derived(await viewingQuery);
	let season = $derived.by(() => {
		const wanted = page.state.seasonId ?? untrack(() => viewing.progress.next)?.season_id;
		return series.seasons.find((season) => season.id === wanted) ?? series.seasons[0];
	});
	const seasonOptions = $derived(
		series.seasons.map((other) => ({
			value: other.id,
			label: other.title,
			detail: other.episode_count === 1 ? "1 Episode" : `${other.episode_count} Episodes`,
		})),
	);
	const seasonWatched = $derived.by(() => {
		const standing = viewing.progress.seasons.find((other) => other.season_id === season?.id);
		return !!standing && standing.watched_episodes === standing.released_episodes;
	});
</script>

<svelte:head>
	<title>{series.title} · Sora</title>
	{#if series.overview}
		<meta name="description" content={series.overview} />
		<meta property="og:description" content={series.overview} />
	{/if}
	<meta property="og:title" content={series.title} />
	<meta property="og:type" content="video.tv_show" />
	{#if series.backdrop_url}
		<meta property="og:image" content={tmdbImage(series.backdrop_url, "w1280")} />
	{/if}
</svelte:head>

<main class="bg-canvas text-foreground">
	<Hero {series} progress={viewing.progress} library={viewing.library} />

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
					<div class="ml-auto">
						<Dropdown class="w-64">
							{#snippet trigger()}
								<DotsThreeVerticalIcon size="1.5rem" weight="bold" />
								Options
							{/snippet}
							{#snippet children()}
								<div role="menu" aria-label="Season options">
									<Button
										role="menuitem"
										variant="item"
										onclick={() =>
											markAllWatched({
												seriesId: series.id,
												seasonId: season.id,
												watched: !seasonWatched,
											})}
									>
										Mark Season as {seasonWatched ? "Unwatched" : "Watched"}
									</Button>
								</div>
							{/snippet}
						</Dropdown>
					</div>
				</div>

				<Episodes
					seriesId={series.id}
					title={series.title}
					backdrop={series.backdrop_url}
					{season}
					progress={viewing.progress}
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
</main>
