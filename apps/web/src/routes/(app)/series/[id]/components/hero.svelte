<script lang="ts">
	import { goto } from "$app/navigation";
	import Button from "$lib/components/ui/button.svelte";
	import Dropdown from "$lib/components/ui/dropdown.svelte";
	import Image from "$lib/components/ui/image.svelte";
	import Sheet from "$lib/components/ui/sheet.svelte";
	import { mobileBackdrop } from "$lib/mobile-backdrop";
	import { audioLabel, cn, tmdbImage, tmdbSrcset } from "$lib/utils";
	import { slug } from "$routes/(app)/(catalog)/genres/slug";
	import { getLibrary } from "$routes/(app)/library.svelte";
	import { startRewatch } from "$routes/(app)/series/[id]/series.remote";
	import type { Series, SeriesProgress } from "@sora/sdk";
	import { BookmarkSimpleIcon, DotsThreeVerticalIcon, PlayIcon, TrophyIcon } from "phosphor-svelte";

	import RatingMenu from "./rating-menu.svelte";
	import WatchlistMenu from "./watchlist-menu.svelte";

	let {
		series,
		progress,
	}: {
		series: Series;
		progress?: SeriesProgress;
	} = $props();

	const SEASON_PREFIX = /^Season\s+/iu;

	let more = $state(false);

	const library = getLibrary();
	const listed = $derived(library.status.has(series.id));

	const rating = $derived(Math.round((series.score ?? 0) / 2) / 10);

	const seasonLabel = (seriesId: string) => {
		const index = series.seasons.findIndex((part) => part.series_id === seriesId);
		const part = series.seasons[index];
		return index > 0 && part?.role === "season" ? ` ${part.title.replace(SEASON_PREFIX, "S")}` : "";
	};

	const done = $derived(
		!!progress?.finished ||
			(library.status.get(series.id) === "completed" &&
				!progress?.rewatch_started_at &&
				!progress?.next),
	);

	const following = $derived(
		series.seasons.slice(series.seasons.findIndex((part) => part.series_id === series.id) + 1),
	);

	const play = $derived.by(() => {
		const later = done
			? following.find(
					(part) =>
						part.role === "season" &&
						part.episode_count > 0 &&
						library.status.get(part.series_id) !== "completed",
				)
			: undefined;
		if (later) {
			const started = library.resume.get(later.series_id)?.episode;
			const episode = started ?? 1;
			const verb = started ? "Continue" : "Start";
			return {
				href: `/series/${later.series_id}/watch/${episode}`,
				label: `${verb} Watching${seasonLabel(later.series_id)}${later.format === "MOVIE" ? "" : ` E${episode}`}`,
				rewatch: false,
			};
		}
		const resume = progress?.next?.episode;
		if (!resume && !series.episode_count) {
			return null;
		}

		const episode = resume ?? 1;
		const suffix = `${seasonLabel(series.id)}${series.format === "MOVIE" ? "" : ` E${episode}`}`;
		const rewatch = !resume && (done || !!progress?.episodes.length);
		let label = `Start Watching${suffix}`;
		if (resume) {
			label = `Continue Watching${suffix}`;
		} else if (rewatch) {
			label = "Rewatch";
		}
		return {
			href: `/series/${series.id}/watch/${episode}`,
			label,
			rewatch,
		};
	});

	const announced = $derived(
		play?.rewatch || !play
			? following.findLast((part) => part.role === "season" && part.episode_count === 0)
			: undefined,
	);

	const next = $derived.by(() => {
		if (!series.next_episode) {
			return null;
		}

		const airing = new Date(series.next_episode.airing_at);
		const aired = airing <= new Date();
		const day = airing.toLocaleDateString("en-US", {
			day: "numeric",
			month: "long",
		});
		const time = airing.toLocaleTimeString("en-GB", {
			hour: "2-digit",
			minute: "2-digit",
		});

		if (series.next_episode.number === 1) {
			return aired ? "Premiere available soon" : `Series premiere starts ${day}`;
		}

		return aired
			? `Next episode aired ${day} at ${time}, available soon`
			: `Next episode airs ${day} at ${time}`;
	});

	const rewatch = async (event: MouseEvent) => {
		event.preventDefault();
		await startRewatch(series.id);
		await goto(`/series/${series.id}/watch/1`);
	};
</script>

<header
	class="series-hero @container relative z-30 grid w-full grid-cols-1 grid-rows-1 bg-black before:pointer-events-none before:z-10 before:col-start-1 before:row-start-1 before:h-full after:pointer-events-none after:z-10 after:col-start-1 after:row-start-1 after:h-full sm:aspect-video sm:max-h-[85svh] sm:min-h-150 short:min-h-[calc(100svh-3.5rem)]"
>
	{#if series.backdrop_url}
		<div class="absolute inset-x-0 top-0 z-0 h-[100vw] sm:bottom-0 sm:h-auto">
			<Image
				src={tmdbImage(series.backdrop_url, "original")}
				srcset={tmdbSrcset(series.backdrop_url, {
					w780: 780,
					w1280: 1280,
					original: 3840,
				})}
				sizes="(min-width: 66.75rem) 100vw, (min-width: 40rem) 67rem, 178vw"
				alt="Backdrop from {series.title}"
				class="object-[50%_35%] max-sm:object-[var(--mobile-backdrop-position,50%)_top]"
				{@attach mobileBackdrop}
				loading="eager"
				fetchpriority="high"
			/>
		</div>
	{/if}

	<div
		class="z-30 col-start-1 row-start-1 mt-3 mr-3 self-start justify-self-end sm:mt-5 sm:mr-8 lg:mr-12"
	>
		<Button
			variant="icon"
			class="sm:hidden"
			aria-label="More"
			aria-haspopup="dialog"
			aria-controls="series-more"
			aria-expanded={more}
			onclick={() => (more = true)}
		>
			<DotsThreeVerticalIcon size="1.5rem" weight="bold" />
		</Button>
		<div class="max-sm:hidden">
			<Dropdown class="w-64">
				{#snippet trigger()}
					<DotsThreeVerticalIcon size="1.5rem" weight="bold" />
					More
				{/snippet}
				{#snippet children()}
					<div role="group" aria-label="More">
						<Button href="/series/{series.id}/media" variant="item">Change Artwork</Button>
					</div>
				{/snippet}
			</Dropdown>
		</div>
	</div>

	<div
		class="z-20 col-start-1 row-start-1 min-w-0 self-end px-5 pt-[calc(75vw-3rem)] pb-6 text-center sm:px-10 sm:pt-0 sm:pb-10 sm:text-left lg:px-16 lg:pb-9"
	>
		<h1
			class={cn(
				"mx-auto w-fit sm:mx-0",
				series.logo_url && "sm:mb-[max(0cqw,calc(var(--logo-y)*100cqw))]",
				!series.logo_url &&
					"max-w-2xl text-2xl leading-tight font-bold text-white sm:text-3xl lg:text-4xl",
			)}
			style:--logo-scale={series.logo_scale}
			style:--logo-x={series.logo_offset_x}
			style:--logo-y={series.logo_offset_y}
		>
			{#if series.logo_url}
				<img
					src={tmdbImage(series.logo_url, "w500")}
					alt={series.title}
					data-hero-logo
					class="h-[calc(clamp(5rem,8cqw,11.5rem)*var(--logo-scale))] max-w-[min(90cqw,calc(65cqw*var(--logo-scale)))] translate-x-[calc(var(--logo-x)*100cqw)] translate-y-[calc(var(--logo-y)*100cqw)] object-contain object-center max-sm:translate-none sm:object-left @min-[40rem]:max-w-[min(90cqw,calc(28rem*var(--logo-scale)))] @5xl:max-w-[min(90cqw,calc(32rem*var(--logo-scale)))]"
				/>
			{:else}
				{series.title}
			{/if}
		</h1>

		{#if next}
			<p class="mt-5 text-sm font-semibold text-[#ece1c2] sm:mt-6 sm:text-base lg:mt-8">{next}</p>
		{:else if announced}
			<p class="mt-5 text-sm font-semibold text-[#ece1c2] sm:mt-6 sm:text-base lg:mt-8">
				You're caught up. {announced.title} hasn't been released yet.
			</p>
		{/if}

		{#if series.current_award}
			<p
				class={cn(
					"flex items-center justify-center gap-2 text-sm text-foreground sm:justify-start sm:text-base",
					next || announced ? "mt-6" : "mt-5 sm:mt-10 lg:mt-11",
				)}
			>
				<TrophyIcon size="1.25em" weight="fill" class="shrink-0 text-accent" />
				{series.current_award}
			</p>
		{/if}

		<p
			class={cn(
				"flex flex-wrap items-center justify-center gap-y-1 text-sm text-muted sm:justify-start",
				series.current_award && "mt-4",
				!series.current_award && (next || announced) && "mt-6",
				!series.current_award && !(next || announced) && "mt-5 sm:mt-10 lg:mt-11",
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
						<span class="comma-separated">
							<a
								href="/genres/{slug(genre)}"
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
				<RatingMenu {series} {rating} />
			</div>
		{/if}

		<div class="mt-6 flex items-center gap-3 sm:mt-7 lg:mt-8 lg:gap-4">
			{#if play}
				<Button
					href={play.href}
					variant="primary"
					class="min-w-0 max-sm:flex-1"
					onclick={play.rewatch ? rewatch : undefined}
				>
					<PlayIcon size="1.55em" weight="bold" />
					<span class="truncate max-sm:hidden">{play.label}</span>
					<span class="truncate sm:hidden">{play.label.replace(" Watching", "")}</span>
				</Button>
				<WatchlistMenu {series} />
			{:else}
				<Button
					variant="primary"
					class="min-w-0 max-sm:flex-1"
					aria-pressed={listed}
					onclick={() => library.toggle(series)}
				>
					<BookmarkSimpleIcon size="1.55em" weight={listed ? "fill" : "bold"} />
					<span class="truncate">{listed ? "Remove from Watchlist" : "Add to Watchlist"}</span>
				</Button>
			{/if}
		</div>
	</div>
</header>

<Sheet bind:open={more} id="series-more" title="More">
	<Button href="/series/{series.id}/media" variant="item" onclick={() => (more = false)}>
		Change Artwork
	</Button>
</Sheet>
