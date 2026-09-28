<script lang="ts">
	import Button from "$lib/components/ui/Button.svelte";
	import Carousel from "$lib/components/ui/Carousel.svelte";
	import ProgressiveImage from "$lib/components/ui/ProgressiveImage.svelte";
	import { audioLabel, cn, tmdbImage } from "$lib/utils";
	import { getListed, setListed } from "$lib/watchlist.remote";
	import type { SeriesCard } from "@sora/sdk";
	import { BookmarkSimpleIcon, CaretLeftIcon, CaretRightIcon, PlayIcon } from "phosphor-svelte";
	import { prefersReducedMotion } from "svelte/motion";

	let {
		featured,
	}: {
		featured: SeriesCard[];
	} = $props();

	const listing = getListed();
	let ready = $state({
		backdrops: new Set<string>(),
		logos: new Set<string>(),
	});
</script>

{#if featured.length}
	<Carousel
		autoplay={15_000}
		class="relative h-[min(100svh,32rem)] touch-pan-y overflow-hidden bg-black select-none sm:h-[min(100svh,42rem)] sm:max-h-192 sm:min-h-180 xl:h-[calc(100svh-3.5rem)] xl:max-h-none"
	>
		{#snippet children({ active: current, previous, paused, cycle, select })}
			{@const series = featured[current]!}
			{@const listed = !!listing.current?.includes(series.id)}
			<div class="flex h-full">
				{#each featured as slide, index (slide.id)}
					<div class="relative h-full min-w-0 flex-[0_0_100%]">
						<article
							class={cn(
								"home-hero-slide absolute inset-0 grid grid-cols-1 grid-rows-1 overflow-hidden transition-opacity duration-500 ease-out motion-reduce:transition-none",
								index === current
									? "opacity-100"
									: index === previous
										? "pointer-events-none opacity-0"
										: "pointer-events-none hidden opacity-0",
							)}
							aria-roledescription="slide"
							aria-label="{slide.title}, {index + 1} of {featured.length}"
							aria-hidden={index !== current}
						>
							<a
								href="/series/{slide.id}"
								class="col-start-1 row-start-1 grid"
								aria-label={slide.title}
								tabindex={index === current ? undefined : -1}
							>
								{#if slide.backdrop_url && (index === current || index === previous)}
									<ProgressiveImage
										src={slide.backdrop_url}
										alt=""
										class="col-start-1 row-start-1"
										imageClass="object-top"
										displaySize="original"
										previewLoading={index === current ? "eager" : "lazy"}
										fetchpriority={index === current ? "high" : "low"}
										onready={() => (ready.backdrops = new Set(ready.backdrops).add(slide.id))}
									/>
								{/if}
							</a>
						</article>
					</div>
				{/each}
			</div>

			<article
				class="home-hero-slide absolute inset-0 grid grid-cols-1 grid-rows-1 overflow-hidden"
			>
				<div
					class="pointer-events-none z-30 col-start-1 row-start-1 min-w-0 self-end pb-8 sm:pb-80 xl:mb-[clamp(0rem,58rem-100svh,9rem)] xl:self-center xl:pb-0"
				>
					<div class="relative">
						<div class="px-5 sm:px-10 lg:px-16">
							<div
								class="relative h-24 w-[min(100%,20rem)] sm:h-32 sm:w-[min(100%,32rem)] lg:h-64 xl:h-auto xl:w-fit"
							>
								<a
									href="/series/{series.id}"
									class="pointer-events-auto relative z-10 flex h-full w-full items-center justify-center px-10 sm:items-end sm:justify-start xl:block xl:h-auto xl:w-fit xl:px-0"
									aria-label={series.title}
								>
									{#each featured as slide, index (slide.id)}
										{#if slide.logo_url && (index === current || index === previous)}
											<img
												src={tmdbImage(slide.logo_url, "w500")}
												alt={index === current ? slide.title : ""}
												aria-hidden={index !== current}
												decoding="async"
												class={cn(
													"max-h-24 max-w-[calc(100%-5rem)] object-contain object-center transition-opacity duration-300 sm:max-h-32 sm:max-w-sm sm:object-left lg:max-h-64 lg:max-w-lg",
													index === current ? "block" : "absolute inset-0",
													index === current &&
														ready.backdrops.has(slide.id) &&
														ready.logos.has(slide.id)
														? "opacity-100"
														: "opacity-0",
												)}
												onload={() => (ready.logos = new Set(ready.logos).add(slide.id))}
											/>
										{/if}
									{/each}
								</a>

								<Button
									class="pointer-events-auto absolute top-1/2 left-0 z-30 hidden size-9 -translate-y-1/2 place-items-center text-white drop-shadow-lg transition-transform duration-150 hover:scale-110 active:scale-90 sm:grid lg:size-11 xl:right-full xl:left-auto xl:mr-2"
									aria-label="Previous"
									onclick={() => select(current - 1, true)}
								>
									<CaretLeftIcon size="1.7rem" weight="bold" />
								</Button>
							</div>
						</div>

						{#if featured.length > 1}
							<Button
								class="pointer-events-auto absolute top-1/2 right-0 z-30 hidden size-9 -translate-y-1/2 place-items-center text-white drop-shadow-lg transition-transform duration-150 hover:scale-110 active:scale-90 sm:grid lg:size-11"
								aria-label="Next"
								onclick={() => select(current + 1, true)}
							>
								<CaretRightIcon size="1.7rem" weight="bold" />
							</Button>
						{/if}
					</div>

					<p
						class="mt-5 flex max-w-[min(100%,36rem)] flex-wrap items-center justify-center gap-y-1 px-5 text-xs text-white/60 sm:justify-start sm:px-10 lg:mt-9 lg:max-w-[min(100%,50rem)] lg:px-16 lg:text-sm"
					>
						{#if series.audio.length}
							<span class="metadata-tag">
								{audioLabel(series.audio)}
							</span>
						{/if}
						{#if series.genres.length}
							<span class="metadata-tag">{series.genres.slice(0, 4).join(", ")}</span>
						{/if}
					</p>

					{#if series.overview}
						<p
							class="mt-2 hidden max-w-[min(100%,36rem)] px-5 text-xs leading-5 text-muted sm:block sm:px-10 lg:mt-3 lg:line-clamp-4 lg:max-w-[min(100%,50rem)] lg:px-16 lg:text-base lg:leading-6"
						>
							{series.overview}
						</p>
					{/if}

					<div
						class="pointer-events-auto mt-5 flex items-center gap-2 px-5 text-xs font-bold text-accent sm:px-10 lg:mt-7 lg:px-16 lg:text-sm max-sm:[&>a]:flex-1 max-sm:[&>a]:justify-center"
					>
						{#if series.start_season_id}
							<a
								href="/series/{series.id}/watch/{series.start_season_id}/1"
								class="inline-flex h-10 items-center gap-2 bg-accent px-4 text-on-accent uppercase transition-[filter,transform] duration-150 hover:brightness-110 active:scale-[0.97]"
							>
								<PlayIcon size="1.2rem" weight="bold" />
								{series.kind === "movie" ? "Play" : "Start watching E1"}
							</a>
						{/if}
						<button
							type="button"
							class="grid size-10 cursor-pointer place-items-center border-2 border-accent transition-[filter,transform] duration-150 hover:brightness-110 active:scale-90"
							aria-label={listed ? "Remove from Watchlist" : "Add to Watchlist"}
							aria-pressed={listed}
							onclick={() =>
								setListed({
									seriesId: series.id,
									listed: !listed,
								}).updates(
									listing.withOverride((ids) =>
										listed ? ids.filter((id) => id !== series.id) : [...ids, series.id],
									),
								)}
						>
							<BookmarkSimpleIcon size="1.35rem" weight={listed ? "fill" : "bold"} />
						</button>
					</div>

					{#if featured.length > 1}
						<div
							class="pointer-events-auto relative z-30 mt-8 flex items-center justify-center gap-2 px-5 sm:justify-start sm:px-10 lg:mt-14 lg:px-16"
						>
							{#each featured as item, index (item.id)}
								<Button
									class={cn(
										"group relative grid h-8 place-items-center transition-[width] duration-300 ease-out motion-reduce:transition-none",
										index === current ? "w-12" : "w-6",
									)}
									aria-label={item.title}
									aria-pressed={index === current}
									onclick={() => select(index, true)}
								>
									<span
										class={cn(
											"relative block h-2 overflow-hidden bg-white/40 transition-[width,background-color] duration-300 ease-out group-hover:bg-accent/60",
											index === current ? "w-12" : "w-6",
										)}
									>
										{#if index === current}
											{#key cycle}
												<span
													class={cn(
														"absolute inset-y-0 left-0 bg-accent",
														prefersReducedMotion.current ? "w-full" : "hero-progress",
														paused && "[animation-play-state:paused]",
													)}
												></span>
											{/key}
										{/if}
									</span>
								</Button>
							{/each}
						</div>
					{/if}
				</div>
			</article>
		{/snippet}
	</Carousel>
{/if}

<style>
	.hero-progress {
		animation: hero-progress 15s linear forwards;
	}

	@keyframes hero-progress {
		from {
			width: 0;
		}

		to {
			width: 100%;
		}
	}
</style>
