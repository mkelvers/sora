<script lang="ts">
	import { goto } from "$app/navigation";
	import Button from "$lib/components/ui/Button.svelte";
	import Dropdown from "$lib/components/ui/Dropdown.svelte";
	import Select from "$lib/components/ui/Select.svelte";
	import { cn } from "$lib/utils";
	import { DotsThreeVerticalIcon } from "phosphor-svelte";

	import type { PageProps } from "./$types";
	import Episodes from "./components/Episodes.svelte";
	import Hero from "./components/Hero.svelte";
	import { getSeries, getSeriesProgress, markSeries } from "./series.remote";

	let { params }: PageProps = $props();

	const series = $derived(await getSeries(params.id));
	const progress = $derived(await getSeriesProgress(params.id));
	const seasonWatched = $derived(
		!progress.rewatch_started_at &&
			progress.episodes.filter((entry) => entry.finished).length >= series.episode_count,
	);
	const parts = $derived(
		series.franchise.map((part) => ({
			value: part.series_id,
			label: part.title,
			detail:
				part.format === "MOVIE"
					? "Movie"
					: part.episode_count
						? `${part.episode_count} ${part.episode_count === 1 ? "Episode" : "Episodes"}`
						: "Coming Soon",
		})),
	);
</script>

<svelte:head>
	<title>{series.title} · Sora</title>
</svelte:head>

<div class="bg-canvas text-foreground">
	<Hero {series} {progress} />

	<div class="relative z-20 bg-canvas px-5 py-7 sm:px-10 lg:px-16 lg:py-8">
		{#if series.overview}
			<section
				aria-label="Synopsis"
				class="max-w-3xl text-xs leading-5 text-foreground lg:text-sm lg:leading-6"
			>
				<p>{series.overview}</p>
			</section>
		{/if}
	</div>

	<div class="px-5 sm:px-10 lg:px-16">
		{#if parts.length > 1 || series.episode_count > 0}
			<div class="flex items-center gap-4 pt-7">
				{#if parts.length > 1}
					<Select
						variant="heading"
						label="Season"
						options={parts}
						bind:value={() => series.id, (id) => goto(`/series/${id}`)}
					/>
				{:else}
					<h2 id="episodes" class="text-lg font-bold">Episodes</h2>
				{/if}
				{#if series.episode_count > 0}
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
											markSeries({
												seriesId: series.id,
												watched: !seasonWatched,
											})}
									>
										Mark Season as {seasonWatched ? "Unwatched" : "Watched"}
									</Button>
								</div>
							{/snippet}
						</Dropdown>
					</div>
				{/if}
			</div>
		{/if}
		{#if series.episode_count > 0}
			<section
				class={cn("pb-7 sm:pb-12 lg:pb-16", parts.length > 1 ? "pt-7" : "pt-6")}
				aria-labelledby="episodes"
			>
				{#if parts.length > 1}
					<h2 id="episodes" class="sr-only">Episodes</h2>
				{/if}

				<Episodes {series} progress={progress.episodes} />
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
