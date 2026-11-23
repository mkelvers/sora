<script lang="ts">
	import { goto } from "$app/navigation";
	import Button from "$lib/components/ui/button.svelte";
	import Dropdown from "$lib/components/ui/dropdown.svelte";
	import Select from "$lib/components/ui/select.svelte";
	import Sheet from "$lib/components/ui/sheet.svelte";
	import { episodes } from "$lib/utils";
	import type { FranchisePart } from "@sora/sdk";
	import {
		CaretDownIcon,
		CaretLeftIcon,
		CaretRightIcon,
		DotsThreeVerticalIcon,
	} from "phosphor-svelte";

	import type { PageProps } from "./$types";
	import About from "./components/about.svelte";
	import Episodes, { pageSize } from "./components/episodes.svelte";
	import Hero from "./components/hero.svelte";
	import Related from "./components/related.svelte";
	import { getEpisodes, getSimilar, getDetails, getTitleProgress, markAll } from "./series.remote";

	let { params }: PageProps = $props();

	const extraEvery = 2;

	const series = $derived(await getDetails(params.id));

	const [progress] = $derived(
		await Promise.all([
			getTitleProgress(params.id),
			getEpisodes({
				backdrop: series.backdrop_url,
				id: params.id,
				limit: pageSize,
				offset: 0,
			}),
		]),
	);

	const current = $derived(series.seasons.find((part) => part.series_id === series.id));

	const subject = $derived.by(() => {
		if (series.format === "MOVIE") {
			return "Movie";
		}

		if (current?.role === "season" && ["TV", "TV_SHORT", "ONA"].includes(series.format ?? "")) {
			return "Season";
		}

		return "Title";
	});

	const position = $derived.by(() => {
		if (current?.role === "season") {
			return series.seasons.indexOf(current);
		}

		return -1;
	});

	const previous = $derived.by(() => {
		if (position <= 0) {
			return;
		}

		return series.seasons[position - 1];
	});

	const next = $derived.by(() => {
		if (position === -1) {
			return;
		}

		return series.seasons[position + 1];
	});

	const paging = $derived(position !== -1 && series.seasons.length > 1);

	const similar = $derived(getSimilar(params.id));

	const alike = $derived.by(() => {
		if (!similar.current) {
			return [];
		}

		const extras = series.related.filter((part) => part.role === "extra").map((part) => part.card);

		const cards = series.related
			.filter((part) => part.role === "spin_off")
			.map((part) => part.card);

		for (const [index, card] of similar.current.entries()) {
			cards.push(card);
			let extra: (typeof extras)[number] | undefined;

			if (index % extraEvery === extraEvery - 1) {
				extra = extras.shift();
			}

			if (extra) {
				cards.push(extra);
			}
		}

		return [...cards, ...extras];
	});

	let choosing = $state(false);
	let options = $state(false);

	const detail = (part: FranchisePart) => {
		if (part.format === "MOVIE") {
			return "Movie";
		}

		if (part.episode_count) {
			return episodes(part.episode_count);
		}

		return "Coming soon";
	};

	const mark = () => {
		options = false;
		markAll({
			seriesId: series.id,
			watched: !progress.finished,
		});
	};
</script>

<svelte:head>
	<title>Watch {series.title} - Sora</title>
</svelte:head>

{#snippet markAction()}
	Mark {subject} as {progress.finished ? "Unwatched" : "Watched"}
{/snippet}

<div class="bg-canvas text-foreground">
	<Hero {series} {progress} />

	<div class="relative z-20 bg-canvas px-5 py-7 sm:px-10 lg:px-16 lg:py-8 hero:px-20">
		<About {series} />
	</div>

	<div class="px-5 sm:px-10 lg:px-16 hero:px-20">
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
					class="min-w-0 shrink text-base sm:hidden"
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
				class={[!paging && "pb-7 sm:pb-12 lg:pb-16", series.seasons.length > 1 ? "pt-3.5" : "pt-3"]}
				aria-labelledby="episodes"
			>
				{#key series.id}
					<Episodes
						{series}
						progress={progress.episodes}
						specials={series.specials.filter((part) => part.season_id === series.id)}
					/>
				{/key}
			</section>
		{:else}
			<section
				class={[
					"mt-7 border-2 border-dotted border-muted px-5 py-14 text-center",
					!paging && "mb-7 sm:mb-12 lg:mb-16",
				]}
				aria-labelledby="check-back"
			>
				<h2 id="check-back" class="font-bold">No episodes yet.</h2>
				<p class="mt-1 text-sm text-muted">
					Check back soon, in the meantime feel free to look around.
				</p>
			</section>
		{/if}

		{#if paging}
			<nav
				aria-label="Seasons"
				class="mt-8 mb-7 flex justify-between border-t border-border pt-4 sm:mt-12 sm:mb-12 lg:mb-16"
			>
				{#if previous}
					<Button
						variant="ghost"
						size="sm"
						class="-ml-2 text-sm hover:bg-transparent"
						href="/series/{previous.series_id}"
					>
						<CaretLeftIcon size="1rem" weight="bold" />
						Previous season
					</Button>
				{:else}
					<span
						class="-ml-2 inline-flex h-9 items-center gap-2 px-2 text-sm font-bold tracking-wide text-muted uppercase"
					>
						<CaretLeftIcon size="1rem" weight="bold" />
						Previous season
					</span>
				{/if}
				{#if next}
					<Button
						variant="ghost"
						size="sm"
						class="-mr-2 text-sm hover:bg-transparent"
						href="/series/{next.series_id}"
					>
						Next season
						<CaretRightIcon size="1rem" weight="bold" />
					</Button>
				{:else}
					<span
						class="-mr-2 inline-flex h-9 items-center gap-2 px-2 text-sm font-bold tracking-wide text-muted uppercase"
					>
						Next season
						<CaretRightIcon size="1rem" weight="bold" />
					</span>
				{/if}
			</nav>
		{/if}
	</div>

	{#if alike.length}
		<Related id="like-this" heading="More Like This" cards={alike} />
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
