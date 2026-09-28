<script lang="ts">
	import Button from "$lib/components/ui/Button.svelte";
	import Carousel from "$lib/components/ui/carousel/Carousel.svelte";
	import Content from "$lib/components/ui/carousel/Content.svelte";
	import Item from "$lib/components/ui/carousel/Item.svelte";
	import Next from "$lib/components/ui/carousel/Next.svelte";
	import Previous from "$lib/components/ui/carousel/Previous.svelte";
	import Image from "$lib/components/ui/Image.svelte";
	import { getListed, setListed } from "$lib/library.remote";
	import { audioLabel, cn, tmdbImage, tmdbSrcset } from "$lib/utils";
	import type { SeriesCard } from "@sora/sdk";
	import Autoplay from "embla-carousel-autoplay";
	import Fade from "embla-carousel-fade";
	import { BookmarkSimpleIcon, PlayIcon } from "phosphor-svelte";
	import { prefersReducedMotion } from "svelte/motion";

	let {
		featured,
	}: {
		featured: SeriesCard[];
	} = $props();

	const listing = getListed();
</script>

{#if featured.length}
	<Carousel
		class="h-[min(100svh,32rem)] touch-pan-y overflow-hidden bg-black select-none sm:h-[min(100svh,42rem)] sm:max-h-192 sm:min-h-180 xl:h-[calc(100svh-3.5rem)] xl:max-h-none"
		options={{ loop: true }}
		plugins={[
			Fade(),
			Autoplay({
				delay: 15_000,
				stopOnMouseEnter: true,
				stopOnFocusIn: true,
				stopOnInteraction: false,
			}),
		]}
	>
		{#snippet children(carousel)}
			<Content>
				{#each featured as slide, index (slide.id)}
					{@const listed = !!listing.current?.includes(slide.id)}
					{@const near = [0, 1, featured.length - 1].includes(
						(index - carousel.active + featured.length) % featured.length,
					)}
					<Item
						class="home-hero-slide grid grid-cols-1 grid-rows-1 overflow-hidden"
						aria-label="{slide.title}, {index + 1} of {featured.length}"
						aria-hidden={index !== carousel.active}
						inert={index !== carousel.active}
					>
						<a
							href="/series/{slide.id}"
							class="col-start-1 row-start-1 grid"
							aria-label={slide.title}
							tabindex={index === carousel.active ? undefined : -1}
						>
							{#if slide.backdrop_url && near}
								<Image
									src={tmdbImage(slide.backdrop_url, "original")}
									srcset={tmdbSrcset(slide.backdrop_url, {
										w780: 780,
										w1280: 1280,
										original: 3840,
									})}
									alt=""
									class="object-top"
									loading={index === carousel.active ? "eager" : "lazy"}
									fetchpriority={index === carousel.active ? "high" : "low"}
								/>
							{/if}
						</a>

						<div
							class="pointer-events-none z-30 col-start-1 row-start-1 min-w-0 self-end pb-8 sm:pb-80 xl:mb-[clamp(0rem,58rem-100svh,9rem)] xl:self-center xl:pb-0"
						>
							<a
								href="/series/{slide.id}"
								class="pointer-events-auto flex h-24 w-[min(100%,20rem)] items-center justify-center px-10 sm:h-32 sm:w-[min(100%,32rem)] sm:justify-start sm:px-10 lg:h-64 lg:px-16 xl:h-auto xl:w-fit"
								aria-label={slide.title}
								tabindex="-1"
							>
								{#if slide.logo_url && near}
									<img
										src={tmdbImage(slide.logo_url, "w500")}
										alt=""
										decoding="async"
										class="max-h-24 max-w-full object-contain object-center sm:max-h-32 sm:max-w-sm sm:object-left lg:max-h-64 lg:max-w-lg"
									/>
								{/if}
							</a>

							<p
								class="mt-5 flex max-w-[min(100%,36rem)] flex-wrap items-center justify-center gap-y-1 px-5 text-xs text-white/60 sm:justify-start sm:px-10 lg:mt-9 lg:max-w-[min(100%,50rem)] lg:px-16 lg:text-sm"
							>
								{#if slide.audio.length}
									<span class="metadata-tag">{audioLabel(slide.audio)}</span>
								{/if}
								{#if slide.genres.length}
									<span class="metadata-tag">{slide.genres.slice(0, 4).join(", ")}</span>
								{/if}
							</p>

							{#if slide.overview}
								<p
									class="mt-2 hidden max-w-[min(100%,36rem)] px-5 text-xs leading-5 text-muted sm:block sm:px-10 lg:mt-3 lg:line-clamp-4 lg:max-w-[min(100%,50rem)] lg:px-16 lg:text-base lg:leading-6"
								>
									{slide.overview}
								</p>
							{/if}

							<div
								class="pointer-events-auto mt-5 flex items-center gap-2 px-5 text-xs font-bold text-accent sm:px-10 lg:mt-7 lg:px-16 lg:text-sm max-sm:[&>a]:flex-1 max-sm:[&>a]:justify-center"
							>
								{#if slide.start_season_id}
									<a
										href="/series/{slide.id}/watch/{slide.start_season_id}/1"
										class="inline-flex h-10 items-center gap-2 bg-accent px-4 text-on-accent uppercase transition-[filter,transform] duration-150 hover:brightness-110 active:scale-[0.97]"
									>
										<PlayIcon size="1.2rem" weight="bold" />
										{slide.kind === "movie" ? "Play" : "Start watching E1"}
									</a>
								{/if}
								<button
									type="button"
									class="grid size-10 cursor-pointer place-items-center border-2 border-accent transition-[filter,transform] duration-150 hover:brightness-110 active:scale-90"
									aria-label={listed ? "Remove from Library" : "Add to Library"}
									aria-pressed={listed}
									onclick={() =>
										setListed({
											seriesId: slide.id,
											listed: !listed,
										}).updates(
											listing.withOverride((ids) =>
												listed ? ids.filter((id) => id !== slide.id) : [...ids, slide.id],
											),
										)}
								>
									<BookmarkSimpleIcon size="1.35rem" weight={listed ? "fill" : "bold"} />
								</button>
							</div>
						</div>
					</Item>
				{/each}
			</Content>

			<Previous class="hidden sm:grid" />
			<Next class="hidden sm:grid" />

			{#if featured.length > 1}
				<div
					class="pointer-events-none z-30 col-start-1 row-start-1 flex items-end justify-center gap-2 px-5 pb-6 sm:justify-start sm:px-10 lg:px-16 lg:pb-10"
				>
					{#each featured as item, index (item.id)}
						<Button
							class={cn(
								"group pointer-events-auto grid h-8 place-items-center transition-[width] duration-300 ease-out motion-reduce:transition-none",
								index === carousel.active ? "w-12" : "w-6",
							)}
							aria-label={item.title}
							aria-pressed={index === carousel.active}
							onclick={() => carousel.select(index)}
						>
							<span
								class="relative block h-2 w-full overflow-hidden bg-white/40 transition-colors duration-300 group-hover:bg-accent/60"
							>
								{#if index === carousel.active}
									{#key carousel.cycle}
										<span
											class={cn(
												"absolute inset-y-0 left-0 bg-accent",
												prefersReducedMotion.current ? "w-full" : "hero-progress",
												carousel.paused && "[animation-play-state:paused]",
											)}
										></span>
									{/key}
								{/if}
							</span>
						</Button>
					{/each}
				</div>
			{/if}
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
