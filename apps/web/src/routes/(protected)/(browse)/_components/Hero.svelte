<script lang="ts">
	import Button from "$lib/components/ui/Button.svelte";
	import Carousel from "$lib/components/ui/carousel/Carousel.svelte";
	import Content from "$lib/components/ui/carousel/Content.svelte";
	import Item from "$lib/components/ui/carousel/Item.svelte";
	import Next from "$lib/components/ui/carousel/Next.svelte";
	import Previous from "$lib/components/ui/carousel/Previous.svelte";
	import Image from "$lib/components/ui/Image.svelte";
	import Tooltip from "$lib/components/ui/Tooltip.svelte";
	import { getListed, setListed } from "$lib/library.remote";
	import { audioLabel, cn, tmdbImage, tmdbSrcset } from "$lib/utils";
	import type { SeriesCard } from "@sora/sdk";
	import Fade from "embla-carousel-fade";
	import { BookmarkSimpleIcon, PlayIcon } from "phosphor-svelte";
	import { prefersReducedMotion } from "svelte/motion";

	let {
		featured,
	}: {
		featured: SeriesCard[];
	} = $props();

	const listing = getListed();
	const delay = 10_000;

	let held = $state(-1);
</script>

{#if featured.length}
	<Carousel
		class="-mb-(--hero-bleed) h-[calc(min(100svh,32rem)+var(--hero-bleed))] touch-pan-y grid-rows-1 overflow-hidden bg-black select-none [--hero-bleed:0rem] sm:h-[calc(52vw+var(--hero-bleed))] sm:min-h-[calc(22rem+var(--hero-bleed))] sm:[--hero-bleed:4rem] xl:h-[calc(100svh-3.5rem+var(--hero-bleed))] xl:[--hero-bleed:10rem] short:h-[calc(100svh-3.5rem+var(--hero-bleed))] short:min-h-0"
		aria-label="Featured series"
		options={{
			loop: true,
		}}
		plugins={[Fade()]}
	>
		{#snippet children(carousel)}
			<Content>
				{#each featured as slide, index (slide.id)}
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
									sizes="(min-width: 80rem) 100vw, (min-width: 40rem) calc(92vw + 7rem), 57rem"
									alt="Backdrop from {slide.title}"
									class="object-top"
									loading={index === carousel.active ? "eager" : "lazy"}
									fetchpriority={index === carousel.active ? "high" : "low"}
								/>
							{/if}
						</a>
					</Item>
				{/each}
			</Content>

			<Previous
				class="mb-[calc(var(--hero-overlap,0rem)+var(--hero-bleed))] hidden hover:text-white/70 sm:grid"
			/>
			<Next
				class="mb-[calc(var(--hero-overlap,0rem)+var(--hero-bleed))] hidden hover:text-white/70 sm:grid"
			/>

			<div
				class="pointer-events-none z-30 col-start-1 row-start-1 mb-(--hero-bleed) grid min-w-0 self-end pb-8 sm:self-center sm:pb-0 xl:mb-[calc(clamp(0rem,58rem-100svh,9rem)+var(--hero-bleed))]"
				style:--hero-delay="{delay}ms"
				{@attach () => carousel.autoplay(delay)}
			>
				{#each featured as slide, index (slide.id)}
					{@const listed = !!listing.current?.includes(slide.id)}
					{@const near = [0, 1, featured.length - 1].includes(
						(index - carousel.active + featured.length) % featured.length,
					)}
					<article
						class={cn(
							"col-start-1 row-start-1 min-w-0 transition-opacity duration-500 motion-reduce:transition-none",
							index !== carousel.active && "opacity-0",
						)}
						aria-label={slide.title}
						aria-hidden={index !== carousel.active}
						inert={index !== carousel.active}
					>
						<a
							href="/series/{slide.id}"
							class="pointer-events-auto flex h-24 w-[min(100%,20rem)] items-end justify-center px-10 sm:h-32 sm:w-[min(100%,32rem)] sm:justify-start sm:px-10 lg:px-20 xl:h-64 xl:w-fit short:h-20"
							aria-label={slide.title}
							tabindex="-1"
						>
							{#if slide.logo_url && near}
								<img
									src={tmdbImage(slide.logo_url, "w500")}
									alt="{slide.title} logo"
									decoding="async"
									class="max-h-[calc(6rem*var(--logo-scale))] max-w-full object-contain object-bottom drop-shadow-xl/50 sm:max-h-[calc(8rem*var(--logo-scale))] sm:max-w-[calc(24rem*var(--logo-scale))] sm:object-bottom-left xl:max-h-[calc(16rem*var(--logo-scale))] xl:max-w-[calc(32rem*var(--logo-scale))] short:max-h-[calc(5rem*var(--logo-scale))]"
									style:--logo-scale={slide.logo_scale}
								/>
							{/if}
						</a>

						<p
							class="mt-5 flex h-5 max-w-[min(100%,36rem)] items-center justify-center px-5 text-xs font-normal whitespace-nowrap text-[#8c8c8c] antialiased sm:h-6 sm:justify-start sm:px-10 sm:text-sm lg:mt-9 lg:h-7 lg:max-w-[min(100%,48rem)] lg:px-20 lg:text-base"
						>
							{#if slide.audio.length}
								<span class="metadata-tag shrink-0">{audioLabel(slide.audio)}</span>
							{/if}
							{#if slide.genres.length}
								<span class="metadata-tag min-w-0 truncate">
									{slide.genres.slice(0, 4).join(", ")}
								</span>
							{/if}
						</p>

						<p
							class="mt-2 hidden h-18 max-w-[min(100%,38rem)] px-5 text-sm leading-6 font-normal text-pretty text-[#bbb] antialiased sm:px-10 lg:mt-3 lg:h-28 lg:max-w-[min(100%,48rem)] lg:px-20 lg:text-base lg:leading-7 xl:line-clamp-4 short:hidden"
						>
							{slide.overview}
						</p>

						<div
							class="pointer-events-auto mt-5 flex items-center gap-2 px-5 sm:px-10 lg:mt-7 lg:px-20"
						>
							{#if slide.start_season_id}
								<Button
									href="/series/{slide.id}/watch/{slide.start_season_id}/1"
									variant="primary"
									class="max-sm:flex-1"
								>
									<PlayIcon size="1.2rem" weight="bold" />
									{#if slide.kind === "movie"}
										Play
									{:else}
										Start watching E1
									{/if}
								</Button>
							{/if}
							<Tooltip text={listed ? "Remove from Library" : "Add to Library"}>
								{#snippet children(trigger)}
									<Button
										{...trigger}
										variant="outline"
										size="square"
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
									</Button>
								{/snippet}
							</Tooltip>
						</div>
					</article>
				{/each}

				{#if featured.length > 1}
					<div
						class="col-start-1 row-start-2 mt-6 flex justify-center gap-2 px-5 sm:justify-start sm:px-10 lg:mt-8 lg:px-20"
						role="group"
						aria-label="Choose a featured series"
					>
						{#each featured as item, index (item.id)}
							<button
								type="button"
								class={cn(
									"group pointer-events-auto h-8 cursor-pointer transition-[width] duration-300 ease-out outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent motion-reduce:transition-none",
									index === carousel.active ? "w-12" : "w-6",
								)}
								aria-label="Show {item.title}"
								aria-pressed={index === carousel.active}
								onclick={() => {
									carousel.select(index);
									held = carousel.cycle;
								}}
							>
								<span
									class="relative block h-2 w-full overflow-hidden rounded-full bg-white/40 transition-colors duration-300 group-hover:bg-accent/60"
								>
									{#if index === carousel.active}
										{#key carousel.cycle}
											<span
												class={cn(
													"absolute inset-y-0 left-0 bg-accent",
													prefersReducedMotion.current || held === carousel.cycle
														? "w-full"
														: "hero-progress",
													carousel.paused && "[animation-play-state:paused]",
												)}
											></span>
										{/key}
									{/if}
								</span>
							</button>
						{/each}
					</div>
				{/if}
			</div>
		{/snippet}
	</Carousel>
{/if}

<style>
	.hero-progress {
		animation: hero-progress var(--hero-delay) linear forwards;
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
