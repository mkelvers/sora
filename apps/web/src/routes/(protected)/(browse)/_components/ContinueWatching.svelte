<script lang="ts">
	import { XIcon } from 'phosphor-svelte';
	import type { ContinueWatchingItem } from '@sora/sdk';
	import Button from '$lib/components/ui/Button.svelte';
	import CardMedia from '$lib/components/ui/CardMedia.svelte';
	import Carousel from '$lib/components/ui/Carousel.svelte';
	import ProgressiveImage from '$lib/components/ui/ProgressiveImage.svelte';
	import Tooltip from '$lib/components/ui/Tooltip.svelte';
	import { dismiss, getContinueWatching } from '../home.remote';

	let {
		items,
	}: {
		items: ContinueWatchingItem[];
	} = $props();
</script>

{#if items.length}
	<section
		class="continue-watching-section relative z-20 col-start-1 row-start-2 row-end-3 min-w-0 self-end px-5 sm:px-10 lg:px-16 wide:row-start-1 wide:row-end-3"
		aria-labelledby="continue-watching"
	>
		<h2 id="continue-watching" class="mb-5 text-xl font-bold sm:text-2xl">Continue Watching</h2>

		<Carousel controls class="min-w-0">
			{#snippet children()}
				<div class="scrollbar-hidden flex min-w-0 gap-3 overscroll-x-contain pb-4 sm:gap-4 lg:gap-7.5">
					{#each items as item (item.series.id)}
						{@const progress =
							item.duration_seconds && item.position_seconds > 0
								? Math.min(100, (item.position_seconds / item.duration_seconds) * 100)
								: 0}
						<div
							class="group relative min-w-0 shrink-0 grow-0 basis-[calc((100vw-3.75rem)/1.35)] min-[30em]:basis-[calc((100vw-4.75rem)/2.1)] min-[35.5em]:basis-[calc((100vw-5.75rem)/2.7)] sm:basis-[calc((100vw-8.75rem)/3.25)] lg:basis-[calc((100vw-18.375rem)/4.25)] 2xl:basis-[calc((100vw-20.25rem)/5.25)]"
						>
							<div class="min-w-0 p-2 transition-colors group-hover:bg-surface group-focus-within:bg-surface">
								<a
									href="/series/{item.series.id}/watch/{item.season_id}/{item.episode}"
									class="block"
									aria-label="Continue watching {item.series.title}, episode {item.episode}"
								>
									<CardMedia aspect="video">
										{#if item.series.backdrop_url}
											<ProgressiveImage src={item.series.backdrop_url} alt="" displaySize="w780" />
										{/if}
										{#if progress > 0}
											<div class="absolute inset-x-0 bottom-0 z-10 h-1 bg-black/60">
												<div class="h-full bg-accent" style:width="{progress}%"></div>
											</div>
										{/if}
									</CardMedia>

									<div class="flex min-h-24 flex-col pt-3">
										<h3 class="line-clamp-2 text-sm leading-snug font-semibold">{item.series.title}</h3>
										<p class="mt-1.5 text-sm text-muted">
											{item.position_seconds > 0 ? 'Continue' : 'Up next'}: E{item.episode}
										</p>
										{#if item.series.audio.length}
											<p class="mt-auto pt-5 text-sm text-muted">
												{audioLabel(item.series.audio)}
											</p>
										{/if}
									</div>
								</a>
							</div>

							<div class="absolute top-2 right-2 z-10 opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-within:opacity-100">
								<Tooltip text="Remove" escapeOverflow>
									<Button
										class="grid size-8 place-items-center text-white/75 drop-shadow-sm transition-[color,transform] duration-150 hover:text-status-error active:scale-90"
										aria-label="Remove {item.series.title} from Continue Watching"
										onclick={() =>
											dismiss(item.series.id).updates(
												getContinueWatching().withOverride((current) =>
													current.filter((other) => other.series.id !== item.series.id)
												)
											)}
									>
										<XIcon size="1rem" weight="bold" />
									</Button>
								</Tooltip>
							</div>
						</div>
					{/each}
				</div>
			{/snippet}
		</Carousel>
	</section>
{/if}
