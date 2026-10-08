<script lang="ts">
	import { goto } from "$app/navigation";
	import Button from "$lib/components/ui/Button.svelte";
	import Dropdown from "$lib/components/ui/Dropdown.svelte";
	import Select from "$lib/components/ui/Select.svelte";
	import Sheet from "$lib/components/ui/Sheet.svelte";
	import { cn } from "$lib/utils";
	import { CaretDownIcon, DotsThreeVerticalIcon } from "phosphor-svelte";

	import type { PageProps } from "./$types";
	import Episodes from "./components/Episodes.svelte";
	import Hero from "./components/Hero.svelte";
	import Related from "./components/Related.svelte";
	import { getSeries, getSeriesProgress, markSeries } from "./series.remote";

	let { params }: PageProps = $props();

	const loaded = $derived(await Promise.all([getSeries(params.id), getSeriesProgress(params.id)]));
	const series = $derived(loaded[0]);
	const progress = $derived(loaded[1]);
	const seasonWatched = $derived(
		series.episode_count > 0 &&
			!progress.rewatch_started_at &&
			progress.episodes.filter((entry) => entry.finished).length >= series.episode_count,
	);
	const currentPart = $derived(series.franchise.find((part) => part.series_id === series.id));
	const seasons = $derived(series.franchise.filter((part) => part.role === "season"));
	const isSeason = $derived(seasons.some((part) => part.series_id === series.id));
	const parts = $derived(
		[...(!isSeason && currentPart ? [currentPart] : []), ...seasons].map((part) => ({
			value: part.series_id,
			label: part.title,
			detail:
				part.format === "MOVIE"
					? "Movie"
					: part.episode_count
						? `${part.episode_count} ${part.episode_count === 1 ? "Episode" : "Episodes"}`
						: "Coming soon",
		})),
	);
	const related = $derived(
		series.franchise.filter((part) => part.series_id !== series.id && part.role === "related"),
	);
	const subject = $derived(isSeason ? "Season" : series.format === "MOVIE" ? "Movie" : "Title");
	let selectingSeason = $state(false);
	let optionsOpen = $state(false);
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
		{#if parts.length > 0 || series.episode_count > 0}
			<div class="flex items-center gap-4 pt-7">
				{#if parts.length > 1}
					<div class="min-w-0 max-sm:hidden">
						<Select
							variant="heading"
							label="Season"
							options={parts}
							bind:value={() => series.id, (id) => goto(`/series/${id}`)}
						/>
					</div>
					<Button
						variant="text"
						class="min-w-0 shrink text-lg sm:hidden"
						aria-label="Season: {currentPart?.title}"
						aria-haspopup="dialog"
						aria-controls="series-seasons"
						aria-expanded={selectingSeason}
						onclick={() => (selectingSeason = true)}
					>
						<CaretDownIcon size="1.1rem" weight="fill" />
						<span class="truncate">{currentPart?.title}</span>
					</Button>
				{:else}
					<h2 id="episodes" class="text-lg font-bold">
						{isSeason ? currentPart?.title : series.format === "MOVIE" ? "Movie" : "Episodes"}
					</h2>
				{/if}
				{#if series.episode_count > 0}
					<Button
						variant="icon"
						class="ml-auto sm:hidden"
						aria-label="Options"
						aria-haspopup="dialog"
						aria-controls="series-options"
						aria-expanded={optionsOpen}
						onclick={() => (optionsOpen = true)}
					>
						<DotsThreeVerticalIcon size="1.5rem" weight="bold" />
					</Button>
					<div class="ml-auto max-sm:hidden">
						<Dropdown class="w-64">
							{#snippet trigger()}
								<DotsThreeVerticalIcon size="1.5rem" weight="bold" />
								Options
							{/snippet}
							{#snippet children()}
								<div role="menu" aria-label="{subject} options">
									<Button
										role="menuitem"
										variant="item"
										onclick={() =>
											markSeries({
												seriesId: series.id,
												watched: !seasonWatched,
											})}
									>
										Mark {subject} as {seasonWatched ? "Unwatched" : "Watched"}
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
				<h2 id="check-back" class="font-bold">No episodes yet.</h2>
				<p class="mt-1 text-sm text-muted">
					Check back soon, in the meantime feel free to look around.
				</p>
			</section>
		{/if}
	</div>
	{#if related.length}
		<Related parts={related} />
	{/if}
</div>

<Sheet bind:open={selectingSeason} id="series-seasons" title="Seasons">
	{#each parts as part (part.value)}
		<Button
			variant="item"
			href="/series/{part.value}"
			aria-current={part.value === series.id ? "page" : undefined}
			class="min-h-11 gap-3 text-sm max-sm:min-h-11 max-sm:text-sm"
			onclick={() => (selectingSeason = false)}
		>
			<span class="min-w-0 truncate">{part.label}</span>
			<span class="ml-auto text-xs">{part.detail}</span>
		</Button>
	{/each}
</Sheet>

<Sheet bind:open={optionsOpen} id="series-options" title="Options">
	<Button
		variant="item"
		onclick={() => {
			optionsOpen = false;
			markSeries({
				seriesId: series.id,
				watched: !seasonWatched,
			});
		}}
	>
		Mark {subject} as {seasonWatched ? "Unwatched" : "Watched"}
	</Button>
</Sheet>
