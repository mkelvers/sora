<script lang="ts">
	import { page } from "$app/state";
	import Button from "$lib/components/ui/Button.svelte";
	import Dropdown from "$lib/components/ui/Dropdown.svelte";
	import { DotsThreeVerticalIcon } from "phosphor-svelte";
	import { untrack } from "svelte";

	import type { PageProps } from "./$types";
	import Details from "./_components/Details.svelte";
	import Episodes from "./_components/Episodes.svelte";
	import Hero from "./_components/Hero.svelte";
	import Seasons from "./_components/Seasons.svelte";
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
	const seasonWatched = $derived.by(() => {
		const standing = viewing.progress.seasons.find((other) => other.season_id === season?.id);
		return !!standing && standing.watched_episodes === standing.released_episodes;
	});
</script>

<svelte:head>
	<title>{series.title} · Sora</title>
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
						<Seasons seasons={series.seasons} bind:season />
					{/if}
					<div class="ml-auto text-sm font-bold [&_.dropdown-trigger]:gap-1">
						<Dropdown class="w-64">
							{#snippet trigger()}
								<DotsThreeVerticalIcon size="1.5rem" weight="bold" />
								Options
							{/snippet}
							{#snippet children()}
								<Button
									role="menuitem"
									class="font-normal focus:text-foreground"
									onclick={() =>
										markAllWatched({
											seriesId: series.id,
											seasonId: season.id,
											watched: !seasonWatched,
										})}
								>
									Mark Season as {seasonWatched ? "Unwatched" : "Watched"}
								</Button>
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
