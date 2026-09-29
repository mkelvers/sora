<script lang="ts">
	import Button from "$lib/components/ui/Button.svelte";
	import Carousel from "$lib/components/ui/carousel/Carousel.svelte";
	import Content from "$lib/components/ui/carousel/Content.svelte";
	import Item from "$lib/components/ui/carousel/Item.svelte";
	import Next from "$lib/components/ui/carousel/Next.svelte";
	import Previous from "$lib/components/ui/carousel/Previous.svelte";
	import Image from "$lib/components/ui/Image.svelte";
	import Tooltip from "$lib/components/ui/Tooltip.svelte";
	import { audioLabel, tmdbImage, tmdbSrcset } from "$lib/utils";
	import type { ContinueWatchingItem } from "@sora/sdk";
	import { TrashIcon } from "phosphor-svelte";

	import { dismiss, getContinueWatching } from "../home.remote";

	let {
		items,
	}: {
		items: ContinueWatchingItem[];
	} = $props();
</script>

{#if items.length}
	<section
		class="continue-watching-section relative z-20 col-start-1 row-start-2 row-end-3 min-w-0 self-end wide:row-start-1 wide:row-end-3"
		aria-labelledby="continue-watching"
	>
		<h2 id="continue-watching" class="mb-5 px-5 text-xl font-bold sm:px-10 sm:text-2xl lg:px-20">
			Continue Watching
		</h2>

		<Carousel
			class="min-w-0"
			options={{
				slidesToScroll: "auto",
				duration: 20,
			}}
		>
			{#snippet children()}
				<Content class="gap-3 pb-4 pl-3 sm:gap-4 sm:pl-8 lg:gap-7.5 lg:pl-18">
					{#each items as item (item.series.id)}
						{@const progress =
							item.duration_seconds && item.position_seconds > 0
								? Math.min(100, (item.position_seconds / item.duration_seconds) * 100)
								: 0}
						<Item
							class="group relative basis-[calc((100vw-3.75rem)/1.35)] last:mr-3 min-[30em]:basis-[calc((100vw-4.75rem)/2.1)] min-[35.5em]:basis-[calc((100vw-5.75rem)/2.7)] sm:basis-[calc((100vw-8.75rem)/3.25)] sm:last:mr-8 lg:basis-[calc((100vw-20.375rem)/4.25)] lg:last:mr-18 2xl:basis-[calc((100vw-22.25rem)/5.25)]"
						>
							<div
								class="h-full min-w-0 p-2 transition-colors group-focus-within:bg-surface group-hover:bg-surface"
							>
								<a
									href="/series/{item.series.id}/watch/{item.season_id}/{item.episode}"
									class="flex h-full flex-col"
									aria-label="Continue watching {item.series.title}, episode {item.episode}"
								>
									<div class="relative aspect-video overflow-hidden bg-surface">
										{#if item.series.backdrop_url}
											<Image
												src={tmdbImage(item.series.backdrop_url, "w780")}
												srcset={tmdbSrcset(item.series.backdrop_url, {
													w780: 780,
													w1280: 1280,
												})}
												sizes="(min-width: 96rem) 19vw, (min-width: 64rem) 23vw, (min-width: 40rem) 30vw, (min-width: 35.5em) 37vw, (min-width: 30em) 47vw, 74vw"
												alt=""
											/>
										{/if}
										{#if progress > 0}
											<div class="absolute inset-x-0 bottom-0 z-10 h-1 bg-black/60">
												<div class="h-full bg-accent" style:width="{progress}%"></div>
											</div>
										{/if}
									</div>

									<div class="flex min-h-24 flex-1 flex-col pt-3">
										<h3 class="line-clamp-2 text-sm leading-snug font-semibold">
											{item.series.title}
										</h3>
										<p class="mt-1.5 text-sm text-muted">
											{item.position_seconds > 0 ? "Continue with" : "Up next:"} E{item.episode}
										</p>
										{#if item.series.audio.length}
											<p class="mt-auto pt-5 text-sm text-muted">
												{audioLabel(item.series.audio)}
											</p>
										{/if}
									</div>
								</a>
							</div>

							<div
								class="absolute right-2 bottom-2 z-10 transition-opacity duration-200 group-focus-within:opacity-100 group-hover:opacity-100 pointer-fine:opacity-0"
							>
								<Tooltip text="Remove">
									{#snippet children(trigger)}
										<Button
											{...trigger}
											class="grid size-8 place-items-center text-muted transition-[color,transform] duration-150 hover:text-status-error active:scale-90"
											aria-label="Remove {item.series.title} from Continue Watching"
											onclick={() =>
												dismiss(item.series.id).updates(
													getContinueWatching().withOverride((current) =>
														current.filter((other) => other.series.id !== item.series.id),
													),
												)}
										>
											<TrashIcon size="1.125rem" />
										</Button>
									{/snippet}
								</Tooltip>
							</div>
						</Item>
					{/each}
				</Content>
				<Previous class="max-sm:hidden" />
				<Next class="max-sm:hidden" />
			{/snippet}
		</Carousel>
	</section>
{/if}
