<script lang="ts">
	import Button from "$lib/components/ui/Button.svelte";
	import Carousel from "$lib/components/ui/carousel/Carousel.svelte";
	import Content from "$lib/components/ui/carousel/Content.svelte";
	import Item from "$lib/components/ui/carousel/Item.svelte";
	import Next from "$lib/components/ui/carousel/Next.svelte";
	import Previous from "$lib/components/ui/carousel/Previous.svelte";
	import Image from "$lib/components/ui/Image.svelte";
	import Tooltip from "$lib/components/ui/Tooltip.svelte";
	import { audioLabel, cn, tmdbImage, tmdbSrcset } from "$lib/utils";
	import { slug } from "$routes/(app)/(catalog)/genres/slug";
	import { getLibrary } from "$routes/(app)/library.svelte";
	import type { SeriesCard } from "@sora/sdk";
	import Fade from "embla-carousel-fade";
	import { BookmarkSimpleIcon, PlayIcon } from "phosphor-svelte";
	import { prefersReducedMotion } from "svelte/motion";

	let {
		featured,
	}: {
		featured: SeriesCard[];
	} = $props();

	const library = getLibrary();
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
					{@const near = [0, 1, featured.length - 1].includes(
						(index - carousel.active + featured.length) % featured.length,
					)}
					{@const listed = library.status.has(slide.id)}
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
							class="pointer-events-auto flex h-24 w-full max-w-xs items-end justify-center px-10 sm:h-32 sm:max-w-lg sm:justify-start sm:px-10 lg:px-20 xl:h-64 xl:w-fit short:h-20"
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
							class="mt-5 flex h-5 max-w-full items-center justify-center px-5 text-xs font-normal whitespace-nowrap text-muted antialiased sm:h-6 sm:max-w-xl sm:justify-start sm:px-10 sm:text-sm lg:mt-9 lg:h-7 lg:max-w-3xl lg:px-20 lg:text-base"
						>
							{#if slide.audio.length}
								<span class="metadata-tag shrink-0">{audioLabel(slide.audio)}</span>
							{/if}
							{#if slide.genres.length}
								<span class="metadata-tag min-w-0 truncate">
									{#each slide.genres.slice(0, 4) as genre (genre)}
										<a
											href="/genres/{slug(genre)}"
											class="pointer-events-auto transition-colors not-last:after:content-[',_'] hover:text-foreground"
										>
											{genre}
										</a>
									{/each}
								</span>
							{/if}
						</p>

						<p
							class="mt-2 hidden h-18 max-w-full px-5 text-sm leading-6 font-normal text-pretty text-muted antialiased sm:max-w-xl sm:px-10 lg:mt-3 lg:h-28 lg:max-w-3xl lg:px-20 lg:text-base lg:leading-7 xl:line-clamp-4 short:hidden"
						>
							{slide.overview}
						</p>

						<div
							class="pointer-events-auto mt-5 flex items-center gap-2 px-5 sm:px-10 lg:mt-7 lg:px-20"
						>
							{#if slide.episode_count > 0}
								<Button href="/series/{slide.id}/watch/1" variant="primary" class="max-sm:flex-1">
									<PlayIcon size="1.2rem" weight="bold" />
									{slide.format === "MOVIE" ? "Start watching" : "Start watching E1"}
								</Button>
								<Tooltip text={listed ? "Remove from Watchlist" : "Add to Watchlist"}>
									{#snippet children(trigger)}
										<Button
											{...trigger}
											variant="outline"
											size="square"
											aria-label={listed ? "Remove from Watchlist" : "Add to Watchlist"}
											aria-pressed={listed}
											onclick={() => library.set(slide, listed ? null : "plan_to_watch")}
										>
											<BookmarkSimpleIcon size="1.5rem" weight={listed ? "fill" : "bold"} />
										</Button>
									{/snippet}
								</Tooltip>
							{:else}
								<Button
									variant="primary"
									class="max-sm:flex-1"
									aria-pressed={listed}
									onclick={() => library.set(slide, listed ? null : "plan_to_watch")}
								>
									<BookmarkSimpleIcon size="1.2rem" weight={listed ? "fill" : "bold"} />
									{listed ? "Remove from Watchlist" : "Add to Watchlist"}
								</Button>
							{/if}
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
								aria-pressed={index === carousel.active}
								onclick={() => {
									carousel.select(index);
									held = carousel.cycle;
								}}
							>
								{#key index === carousel.active ? carousel.cycle : -1}
									<span
										class={cn(
											"relative block h-2 w-full overflow-hidden rounded-full bg-white/40 transition-colors duration-300 group-hover:bg-accent/60",
											index === carousel.active &&
												"after:absolute after:inset-y-0 after:left-0 after:bg-accent",
											index === carousel.active &&
												(prefersReducedMotion.current || held === carousel.cycle
													? "after:w-full"
													: "hero-progress"),
											index === carousel.active &&
												carousel.paused &&
												"after:[animation-play-state:paused]",
										)}
									>
										<span class="sr-only">Show {item.title}</span>
									</span>
								{/key}
							</button>
						{/each}
					</div>
				{/if}
			</div>
		{/snippet}
	</Carousel>
{/if}

<style>
	.hero-progress::after {
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
