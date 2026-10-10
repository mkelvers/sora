<script lang="ts">
	import { goto } from "$app/navigation";
	import Button from "$lib/components/ui/Button.svelte";
	import Dropdown from "$lib/components/ui/Dropdown.svelte";
	import Select from "$lib/components/ui/Select.svelte";
	import Sheet from "$lib/components/ui/Sheet.svelte";
	import { episodes } from "$lib/utils";
	import type { FranchisePart } from "@sora/sdk";
	import { CaretDownIcon, DotsThreeVerticalIcon } from "phosphor-svelte";

	import type { PageProps } from "./$types";
	import Episodes from "./components/Episodes.svelte";
	import Hero from "./components/Hero.svelte";
	import Related from "./components/Related.svelte";
	import { getSeries, getSeriesProgress, markSeries } from "./series.remote";

	let { params }: PageProps = $props();

	const [series, progress] = $derived(
		await Promise.all([getSeries(params.id), getSeriesProgress(params.id)]),
	);
	const current = $derived(series.seasons.find((part) => part.series_id === series.id));
	const subject = $derived(
		series.format === "MOVIE"
			? "Movie"
			: current?.role === "season" && ["TV", "TV_SHORT", "ONA"].includes(series.format ?? "")
				? "Season"
				: "Title",
	);

	const extras = $derived(series.related.filter((part) => part.role === "extra"));
	const spinOffs = $derived(series.related.filter((part) => part.role === "spin_off"));

	let choosing = $state(false);
	let options = $state(false);

	function detail(part: FranchisePart) {
		if (part.format === "MOVIE") {
			return "Movie";
		}

		return part.episode_count ? episodes(part.episode_count) : "Coming soon";
	}

	function mark() {
		options = false;
		markSeries({
			seriesId: series.id,
			watched: !progress.finished,
		});
	}
</script>

<svelte:head>
	<title>{series.title} · Sora</title>
</svelte:head>

{#snippet markAction()}
	Mark {subject} as {progress.finished ? "Unwatched" : "Watched"}
{/snippet}

<div class="bg-canvas text-foreground">
	<Hero {series} {progress} />

	<div class="relative z-20 bg-canvas px-5 py-7 sm:px-10 lg:px-16 lg:py-8">
		{#if series.overview}
			<section aria-label="Synopsis" class="max-w-3xl text-xs leading-5 lg:text-sm lg:leading-6">
				<p>{series.overview}</p>
			</section>
		{/if}
	</div>

	<div class="px-5 sm:px-10 lg:px-16">
		<div class="flex items-center gap-4 pt-7">
			{#if series.seasons.length > 1}
				<h2 id="episodes" class="sr-only">Episodes</h2>
				<div class="min-w-0 max-sm:hidden">
					<Select
						variant="heading"
						label="Season"
						options={series.seasons.map((part) => ({
							value: part.series_id,
							label: part.title,
							detail: detail(part),
						}))}
						bind:value={() => series.id, (id) => goto(`/series/${id}`)}
					/>
				</div>
				<Button
					variant="text"
					class="min-w-0 shrink text-lg sm:hidden"
					aria-label="Season: {current?.title}"
					aria-haspopup="dialog"
					aria-controls="series-seasons"
					aria-expanded={choosing}
					onclick={() => (choosing = true)}
				>
					<CaretDownIcon size="1.1rem" weight="fill" />
					<span class="truncate">{current?.title}</span>
				</Button>
			{:else}
				<h2 id="episodes" class="text-lg font-bold">
					{current?.role === "season"
						? current.title
						: series.format === "MOVIE"
							? "Movie"
							: "Episodes"}
				</h2>
			{/if}

			{#if series.episode_count > 0}
				<Button
					variant="icon"
					class="ml-auto sm:hidden"
					aria-label="Options"
					aria-haspopup="dialog"
					aria-controls="series-options"
					aria-expanded={options}
					onclick={() => (options = true)}
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
								<Button role="menuitem" variant="item" onclick={mark}>
									{@render markAction()}
								</Button>
							</div>
						{/snippet}
					</Dropdown>
				</div>
			{/if}
		</div>

		{#if series.episode_count > 0}
			<section
				class={["pb-7 sm:pb-12 lg:pb-16", series.seasons.length > 1 ? "pt-7" : "pt-6"]}
				aria-labelledby="episodes"
			>
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

	{#if extras.length}
		<Related id="extras" heading="More from this series" parts={extras} />
	{/if}
	{#if spinOffs.length}
		<Related id="spin-offs" heading="Spin-offs" parts={spinOffs} />
	{/if}
</div>

<Sheet bind:open={choosing} id="series-seasons" title="Seasons">
	{#each series.seasons as part (part.series_id)}
		<Button
			variant="item"
			href="/series/{part.series_id}"
			aria-current={part.series_id === series.id ? "page" : undefined}
			class="min-h-11 gap-3 text-sm max-sm:min-h-11 max-sm:text-sm"
			onclick={() => (choosing = false)}
		>
			<span class="min-w-0 truncate">{part.title}</span>
			<span class="ml-auto text-xs">{detail(part)}</span>
		</Button>
	{/each}
</Sheet>

<Sheet bind:open={options} id="series-options" title="Options">
	<Button variant="item" onclick={mark}>{@render markAction()}</Button>
</Sheet>
