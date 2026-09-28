<script lang="ts">
	import Button from "$lib/components/ui/Button.svelte";
	import Dropdown from "$lib/components/ui/Dropdown.svelte";
	import Image from "$lib/components/ui/Image.svelte";
	import Tooltip from "$lib/components/ui/Tooltip.svelte";
	import { getListed, setListed } from "$lib/library.remote";
	import { audioLabel, cn, tmdbImage, tmdbSrcset } from "$lib/utils";
	import type { LibraryEntry, LibraryStatus, Series, TitleProgress } from "@sora/sdk";
	import {
		BookmarkSimpleIcon,
		DotsThreeVerticalIcon,
		ListChecksIcon,
		PlayIcon,
	} from "phosphor-svelte";

	import { markAllWatched, setStatus } from "../series.remote";

	let {
		series,
		progress,
		library,
	}: {
		series: Series;
		progress: TitleProgress;
		library: LibraryEntry;
	} = $props();

	const listing = getListed();
	const listed = $derived(listing.current?.includes(series.id) ?? library.status !== null);

	function toggleListed() {
		setListed({
			seriesId: series.id,
			listed: !listed,
		}).updates(
			listing.withOverride((ids) =>
				listed ? ids.filter((id) => id !== series.id) : [...ids, series.id],
			),
		);
	}

	const statuses: [LibraryStatus, string][] = [
		["watching", "Watching"],
		["planning", "Plan to Watch"],
		["completed", "Completed"],
		["dropped", "Dropped"],
	];

	const play = $derived.by(() => {
		const { next, new_season } = progress;
		if (next) {
			const where = series.seasons.find((other) => other.id === next.season_id);
			return {
				href: `/series/${series.id}/watch/${next.season_id}/${next.episode}`,
				label: `${next.position_seconds > 0 ? "Continue with" : "Start with"} ${series.seasons.length > 1 && where ? `${where.title} ` : ""}E${next.episode}`,
			};
		}

		if (new_season) {
			return {
				href: `/series/${series.id}/watch/${new_season.season_id}/1`,
				label: `Start ${new_season.title} E1`,
			};
		}

		const first = series.seasons.find((other) => other.in_watch_order) ?? series.seasons[0];
		return (
			first && {
				href: `/series/${series.id}/watch/${first.id}/1`,
				label: progress.caught_up
					? "Watch again"
					: series.kind === "movie"
						? "Play"
						: "Start watching E1",
			}
		);
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

	const item =
		"flex w-full items-center justify-start gap-3 px-5 py-3 text-left text-sm font-normal whitespace-nowrap text-muted focus:bg-panel-hover focus:text-foreground focus:outline-none";
</script>

{#snippet star(tone: string)}
	<svg class={cn("size-6 max-w-none", tone)} viewBox="0 0 24 24" stroke-linejoin="miter">
		<path
			d="M12 2.5l2.94 6.08 6.56.95-4.75 4.63 1.12 6.54L12 17.6l-5.87 3.1 1.12-6.54L2.5 9.53l6.56-.95z"
		></path>
	</svg>
{/snippet}

<section>
	<figure
		class="series-hero relative z-30 grid aspect-video max-h-[85svh] min-h-120 w-full grid-cols-1 grid-rows-1 bg-black before:pointer-events-none before:z-10 before:col-start-1 before:row-start-1 before:h-full after:pointer-events-none after:z-10 after:col-start-1 after:row-start-1 after:h-full sm:min-h-150"
	>
		<h1 class="sr-only">{series.title}</h1>

		{#if series.backdrop_url}
			<div class="absolute inset-0 z-0">
				<Image
					src={tmdbImage(series.backdrop_url, "original")}
					srcset={tmdbSrcset(series.backdrop_url, { w780: 780, w1280: 1280, original: 3840 })}
					alt=""
					class="object-[50%_35%]"
					loading="eager"
					fetchpriority="high"
				/>
			</div>
		{/if}

		<div
			class="z-30 col-start-1 row-start-1 mt-3 mr-3 self-start justify-self-end leading-none font-bold sm:mt-5 sm:mr-8 lg:mr-12 [&_.dropdown-trigger]:gap-1 [&_.dropdown-trigger]:text-white"
		>
			<Dropdown class="w-64 *:p-0">
				{#snippet trigger()}
					<DotsThreeVerticalIcon size="1.5rem" weight="bold" />
					<span>More</span>
				{/snippet}
				{#snippet children()}
					<div role="menu" aria-label="More">
						{#if series.seasons.length}
							<Button
								role="menuitem"
								class={item}
								onclick={() =>
									markAllWatched({
										seriesId: series.id,
										watched: !progress.caught_up,
									})}
							>
								Mark Series as {progress.caught_up ? "Unwatched" : "Watched"}
							</Button>
						{/if}

						<a role="menuitem" href="/series/{series.id}/media" class={item}>View Media Options</a>
					</div>
				{/snippet}
			</Dropdown>
		</div>

		<div class="z-20 col-start-1 row-start-1 min-w-0 self-end px-5 pb-10 sm:px-10 lg:px-16 lg:pb-9">
			<div class="w-fit">
				{#if series.logo_url}
					<img
						src={tmdbImage(series.logo_url, "w500")}
						alt=""
						aria-hidden="true"
						class="h-[clamp(5rem,8vw,11.5rem)] max-w-[65vw] object-contain object-left sm:max-w-md lg:max-w-lg"
					/>
				{:else}
					<p
						aria-hidden="true"
						class="max-w-3xl text-4xl leading-tight font-bold text-white sm:text-5xl lg:text-6xl"
					>
						{series.title}
					</p>
				{/if}
			</div>

			{#if next}
				<p class="mt-5 text-sm font-semibold text-[#ece1c2] sm:mt-6 sm:text-base">{next}</p>
			{/if}

			<p
				class={cn(
					"flex flex-wrap items-center gap-y-1 text-sm text-muted",
					next ? "mt-5 lg:mt-7" : "mt-8 sm:mt-10 lg:mt-11",
				)}
			>
				{#if series.audio.length}
					<span class="metadata-tag">
						{audioLabel(series.audio)}
					</span>
				{/if}
				{#if series.genres.length}
					<span class="metadata-tag">
						{#each series.genres as genre, index (genre)}{#if index > 0},{" "}{/if}<span
								class="underline underline-offset-2">{genre}</span
							>{/each}
					</span>
				{/if}
			</p>

			{#if series.score !== null}
				<div class="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm lg:gap-2.5">
					<span class="flex items-center gap-0.5" aria-hidden="true">
						{#each { length: 5 }, index (index)}
							<span class="relative size-6 shrink-0">
								{@render star("fill-none stroke-[#bbb] stroke-[1.5]")}
								<span
									class="absolute inset-y-0 left-0 overflow-hidden"
									style:width="{Math.min(Math.max(rating - index, 0), 1) * 100}%"
								>
									{@render star("fill-[#bbb] stroke-[#bbb] stroke-[1.5]")}
								</span>
							</span>
						{/each}
					</span>
					<span class="hidden text-border-strong sm:inline" aria-hidden="true">|</span>
					<span class="font-medium text-[#bbb]">
						Average rating:
						<strong class="text-foreground">
							{rating.toFixed(1)}{series.score_count
								? ` (${new Intl.NumberFormat("en-US", {
										notation: "compact",
									}).format(series.score_count)})`
								: ""}
						</strong>
					</span>
				</div>
			{/if}

			<div
				class="mt-7 flex items-center gap-3 text-xs font-bold text-accent max-sm:flex-wrap sm:text-sm lg:mt-8 lg:gap-4"
			>
				{#if play}
					<a
						href={play.href}
						class="flex h-10 items-center gap-2.5 bg-accent px-4 text-on-accent uppercase transition-[filter] duration-150 hover:brightness-120 sm:px-6"
					>
						<PlayIcon size="1.55em" weight="bold" />
						{play.label}
					</a>
				{/if}

				{#if play}
					<Tooltip text={listed ? "Remove from Library" : "Add to Library"}>
						{#snippet children(trigger)}
							<button
								{...trigger}
								type="button"
								class="grid size-10 cursor-pointer place-items-center border-2 border-accent transition-[filter] duration-150 hover:brightness-120"
								aria-label={listed ? "Remove from Library" : "Add to Library"}
								aria-pressed={listed}
								onclick={toggleListed}
							>
								<BookmarkSimpleIcon size="1.65em" weight={listed ? "fill" : "bold"} />
							</button>
						{/snippet}
					</Tooltip>
				{:else}
					<button
						type="button"
						class="flex h-10 cursor-pointer items-center gap-2.5 bg-accent px-4 text-on-accent uppercase transition-[filter] duration-150 hover:brightness-120 sm:px-6"
						aria-pressed={listed}
						onclick={toggleListed}
					>
						<BookmarkSimpleIcon size="1.55em" weight={listed ? "fill" : "bold"} />
						{listed ? "On Watchlist" : "Add to Watchlist"}
					</button>
				{/if}

				<Tooltip text="Manage Status">
					{#snippet children(trigger)}
						<div
							{...trigger}
							class="[&_.dropdown-trigger]:grid [&_.dropdown-trigger]:size-10 [&_.dropdown-trigger]:place-items-center [&_.dropdown-trigger]:p-0 [&_.dropdown-trigger]:[font-size:inherit] [&_.dropdown-trigger]:text-accent [&_.dropdown-trigger]:transition-[filter] [&_.dropdown-trigger]:duration-150 [&_.dropdown-trigger]:group-has-[.dropdown-menu:popover-open]:bg-transparent [&_.dropdown-trigger]:group-has-[.dropdown-menu:popover-open]:text-accent [&_.dropdown-trigger]:hover:bg-transparent [&_.dropdown-trigger]:hover:brightness-120"
						>
							<Dropdown alignment="left" label="Manage Status" class="w-56 *:p-0">
								{#snippet trigger()}
									<ListChecksIcon size="1.8em" weight="bold" />
								{/snippet}
								{#snippet children()}
									<div role="menu" aria-label="Status">
										{#each statuses as [status, label] (status)}
											<Button
												role="menuitemradio"
												aria-checked={library.status === status}
												class={item}
												onclick={() =>
													setStatus({
														seriesId: series.id,
														status,
													})}
											>
												{label}
											</Button>
										{/each}
									</div>
								{/snippet}
							</Dropdown>
						</div>
					{/snippet}
				</Tooltip>
			</div>
		</div>
	</figure>
</section>
