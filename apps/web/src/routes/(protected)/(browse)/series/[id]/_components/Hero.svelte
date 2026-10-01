<script lang="ts">
	import Button from "$lib/components/ui/Button.svelte";
	import Dropdown from "$lib/components/ui/Dropdown.svelte";
	import Image from "$lib/components/ui/Image.svelte";
	import Tooltip from "$lib/components/ui/Tooltip.svelte";
	import { getDropped, getShows, setDropped, setListed } from "$lib/shows.remote";
	import { audioLabel, cn, genreSlug, tmdbImage, tmdbSrcset } from "$lib/utils";
	import type { NextEpisode, Series, SeriesProgress } from "@sora/sdk";
	import {
		BookmarkSimpleIcon,
		DotsThreeVerticalIcon,
		PlayIcon,
		StarIcon,
		ThumbsDownIcon,
	} from "phosphor-svelte";

	let {
		series,
		progress,
	}: {
		series: Series;
		progress?: SeriesProgress;
	} = $props();

	const shows = getShows();
	const listed = $derived(!!shows.current?.some((show) => show.series.id === series.id));

	const droppedQuery = getDropped();
	const dropped = $derived(!!droppedQuery.current?.series_ids.includes(series.id));

	function toggleDropped() {
		const drop = !dropped;
		const seriesId = series.id;
		setDropped({
			seriesId,
			dropped: drop,
		}).updates(
			getDropped().withOverride((current) => ({
				...current,
				series_ids: drop
					? [...current.series_ids, seriesId]
					: current.series_ids.filter((id) => id !== seriesId),
			})),
		);
	}

	function toggleListed() {
		const add = !listed;
		const added = new Date().toISOString();
		setListed({
			seriesId: series.id,
			listed: add,
		}).updates(
			getShows().withOverride((current) =>
				add
					? [
							{
								series,
								added_at: added,
								active_at: added,
								status: "planned" as const,
								next: null,
								offered: null,
								episode_count: series.episode_count,
								watched_count: 0,
							},
							...current,
						]
					: current.filter((show) => show.series.id !== series.id),
			),
		);
	}

	function place(episode: NextEpisode) {
		if (series.kind === "movie") {
			return "";
		}

		if (episode.season_kind === "movie") {
			return ` ${episode.season_title}`;
		}

		const season = series.seasons.find((other) => other.id === episode.season_id);
		if (episode.season_kind === "ova" || !season) {
			return ` ${episode.season_title} E${episode.episode}`;
		}

		return series.seasons.filter((other) => other.kind === "season").length > 1
			? ` S${season.number} E${episode.episode}`
			: ` E${episode.episode}`;
	}

	const play = $derived.by(() => {
		const resume = progress?.next;
		const offered = progress?.offered;
		if (resume) {
			return {
				href: `/series/${series.id}/watch/${resume.season_id}/${resume.episode}`,
				label: `Continue watching${place(resume)}`,
			};
		}

		if (offered) {
			return {
				href: `/series/${series.id}/watch/${offered.season_id}/${offered.episode}`,
				label: `Start watching${place(offered)}`,
			};
		}

		const first = series.seasons.find((other) => other.in_watch_order) ?? series.seasons[0];
		if (!first) {
			return null;
		}

		const href = `/series/${series.id}/watch/${first.id}/1`;
		if (progress?.episodes.length || progress?.watched.length) {
			return {
				href,
				label: "Watch again",
			};
		}

		return {
			href,
			label: series.kind === "movie" ? "Start watching" : "Start watching E1",
		};
	});

	const rating = $derived(Math.round((series.score ?? 0) / 2) / 10);

	const next = $derived.by(() => {
		if (!series.next_episode) {
			return null;
		}

		const airing = new Date(series.next_episode.airing_at);
		if (airing <= new Date()) {
			return null;
		}

		const day = airing.toLocaleDateString("en-US", {
			month: "long",
			day: "numeric",
		});
		const { season_id, number } = series.next_episode;
		if (number > 1) {
			return `Next episode airs ${day} at ${airing.toLocaleTimeString("en-GB", {
				hour: "2-digit",
				minute: "2-digit",
			})}`;
		}

		const where = series.seasons.find((other) => other.id === season_id);
		if (where && where.kind !== "season") {
			return `${where.title} starting ${day}`;
		}

		const first = series.seasons.find((other) => other.kind === "season");
		return !first || first.id === season_id
			? `Series premiere starts ${day}`
			: `New season starting ${day}`;
	});
</script>

<header
	class="series-hero @container relative z-30 grid w-full grid-cols-1 grid-rows-1 bg-black before:pointer-events-none before:z-10 before:col-start-1 before:row-start-1 before:h-full after:pointer-events-none after:z-10 after:col-start-1 after:row-start-1 after:h-full sm:aspect-video sm:max-h-[85svh] sm:min-h-150 short:min-h-[calc(100svh-3.5rem)]"
>
	{#if series.backdrop_url}
		<div class="absolute inset-x-0 top-0 z-0 aspect-4/3 sm:bottom-0 sm:aspect-auto">
			<Image
				src={tmdbImage(series.backdrop_url, "original")}
				srcset={tmdbSrcset(series.backdrop_url, {
					w780: 780,
					w1280: 1280,
					original: 3840,
				})}
				sizes="(min-width: 66.75rem) 100vw, (min-width: 40rem) 67rem, 134vw"
				alt="Backdrop from {series.title}"
				class="object-[50%_35%]"
				loading="eager"
				fetchpriority="high"
			/>
		</div>
	{/if}

	<div
		class="z-30 col-start-1 row-start-1 mt-3 mr-3 self-start justify-self-end sm:mt-5 sm:mr-8 lg:mr-12"
	>
		<Dropdown class="w-64">
			{#snippet trigger()}
				<DotsThreeVerticalIcon size="1.5rem" weight="bold" />
				<span class="max-sm:sr-only">More</span>
			{/snippet}
			{#snippet children()}
				<div role="menu" aria-label="More">
					<Button role="menuitem" href="/series/{series.id}/media" variant="item">
						View Media Options
					</Button>
				</div>
			{/snippet}
		</Dropdown>
	</div>

	<div
		class="z-20 col-start-1 row-start-1 min-w-0 self-end px-5 pt-[calc(75vw-3rem)] pb-6 text-center sm:px-10 sm:pt-0 sm:pb-10 sm:text-left lg:px-16 lg:pb-9"
	>
		<h1
			class={cn(
				"mx-auto w-fit sm:mx-0",
				!series.logo_url &&
					"max-w-2xl text-2xl leading-tight font-bold text-white sm:text-3xl lg:text-4xl",
			)}
		>
			{#if series.logo_url}
				<img
					src={tmdbImage(series.logo_url, "w500")}
					alt={series.title}
					data-hero-logo
					class="h-[calc(clamp(5rem,8cqw,11.5rem)*var(--logo-scale))] max-w-[min(90cqw,calc(65cqw*var(--logo-scale)))] translate-x-[calc(var(--logo-x)*100cqw)] translate-y-[calc(var(--logo-y)*100cqw)] object-contain object-center max-sm:translate-none sm:object-left @min-[40rem]:max-w-[min(90cqw,calc(28rem*var(--logo-scale)))] @min-[64rem]:max-w-[min(90cqw,calc(32rem*var(--logo-scale)))]"
					style:--logo-scale={series.logo_scale}
					style:--logo-x={series.logo_offset_x}
					style:--logo-y={series.logo_offset_y}
				/>
			{:else}
				{series.title}
			{/if}
		</h1>

		{#if next}
			<p class="mt-5 text-sm font-semibold text-[#ece1c2] sm:mt-6 sm:text-base">{next}</p>
		{/if}

		<p
			class={cn(
				"flex flex-wrap items-center justify-center gap-y-1 text-sm text-muted sm:justify-start",
				next ? "mt-5 lg:mt-7" : "mt-5 sm:mt-10 lg:mt-11",
			)}
		>
			{#if series.audio.length}
				<span class="metadata-tag">
					{audioLabel(series.audio)}
				</span>
			{/if}
			{#if series.genres.length}
				<span class="metadata-tag">
					{#each series.genres as genre (genre)}
						<span class="not-last:after:content-[',_']">
							<a
								href="/genres/{genreSlug(genre)}"
								class="underline underline-offset-2 transition-colors hover:text-foreground"
							>
								{genre}
							</a>
						</span>
					{/each}
				</span>
			{/if}
		</p>

		{#if series.score !== null}
			<div
				class="mt-3 flex flex-wrap items-center justify-center gap-x-3 gap-y-2 text-sm sm:justify-start lg:gap-2.5"
			>
				<span class="flex items-center gap-0.5" aria-hidden="true">
					{#each { length: 5 }, index (index)}
						<span class="relative size-6 shrink-0">
							<StarIcon size="1.5rem" class="text-[#bbb]" />
							<span
								class="absolute inset-y-0 left-0 overflow-hidden"
								style:width="{Math.min(Math.max(rating - index, 0), 1) * 100}%"
							>
								<StarIcon size="1.5rem" weight="fill" class="max-w-none text-[#bbb]" />
							</span>
						</span>
					{/each}
				</span>
				<span class="hidden text-border-strong sm:inline" aria-hidden="true">|</span>
				<span class="font-medium text-[#bbb]">
					<span class="max-sm:sr-only">Average rating:</span>
					<strong class="text-foreground">
						{rating.toFixed(1)}
						{#if series.score_count}
							({series.score_count.toLocaleString("en-US", {
								notation: "compact",
							})})
						{/if}
					</strong>
				</span>
			</div>
		{/if}

		<div class="mt-6 flex items-center gap-3 sm:mt-7 lg:mt-8 lg:gap-4">
			{#if play}
				<Button href={play.href} variant="primary" class="min-w-0 max-sm:flex-1">
					<PlayIcon size="1.55em" weight="bold" />
					<span class="truncate">{play.label}</span>
				</Button>

				<Tooltip text={listed ? "Remove from Shows" : "Add to Shows"}>
					{#snippet children(trigger)}
						<Button
							{...trigger}
							variant="outline"
							size="square"
							aria-label={listed ? "Remove from Shows" : "Add to Shows"}
							aria-pressed={listed}
							onclick={toggleListed}
						>
							<BookmarkSimpleIcon size="1.65em" weight={listed ? "fill" : "bold"} />
						</Button>
					{/snippet}
				</Tooltip>
			{:else}
				<Button
					variant="primary"
					class="max-sm:flex-1"
					aria-pressed={listed}
					onclick={toggleListed}
				>
					<BookmarkSimpleIcon size="1.55em" weight={listed ? "fill" : "bold"} />
					{#if listed}
						In Shows
					{:else}
						Add to Shows
					{/if}
				</Button>
			{/if}

			<Tooltip text={dropped ? "Pick Series Back Up" : "Drop Series"}>
				{#snippet children(trigger)}
					<Button
						{...trigger}
						variant="outline"
						size="square"
						aria-label={dropped ? "Pick Series Back Up" : "Drop Series"}
						aria-pressed={dropped}
						onclick={toggleDropped}
					>
						<ThumbsDownIcon size="1.65em" weight={dropped ? "fill" : "bold"} />
					</Button>
				{/snippet}
			</Tooltip>
		</div>
	</div>
</header>
