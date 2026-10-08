<script lang="ts">
	import { cn, tmdbImage, tmdbSrcset } from "$lib/utils";
	import { getImages } from "$routes/(app)/series/[id]/media/media.remote";
	import type { Media } from "$routes/(app)/series/[id]/media/media.svelte";
	import type { Series } from "@sora/sdk";

	let {
		series,
		media,
	}: {
		series: Series;
		media: Media;
	} = $props();

	const images = $derived(await getImages(series.id));
	const shown = $derived(media.apply(images));
	const current = $derived(series[`${media.type}_url`]?.split("/").at(-1));

	const srcsets = {
		poster: {
			w342: 342,
			w500: 500,
			w780: 780,
		},
		backdrop: {
			w780: 780,
			w1280: 1280,
		},
		logo: {
			w300: 300,
			w500: 500,
		},
	};
	const sizes = {
		poster:
			"(min-width: 80rem) 12vw, (min-width: 64rem) 16vw, (min-width: 48rem) 22vw, (min-width: 40rem) 30vw, 45vw",
		wide: "(min-width: 80rem) 25vw, (min-width: 64rem) 35vw, (min-width: 40rem) 45vw, 90vw",
	};
</script>

<ul
	aria-label="Available {media.type}s"
	class={cn(
		"grid gap-x-5 gap-y-6",
		media.type === "poster"
			? "grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6"
			: "grid-cols-1 sm:grid-cols-2 xl:grid-cols-3",
	)}
>
	{#each media.type === "poster" ? shown : [undefined, ...shown] as image (image?.url ?? "none")}
		{@const chosen = image
			? current === image.url.split("/").at(-1)
			: series[`${media.type}_url`] === null}
		<li>
			<button
				type="button"
				class="group grid w-full min-w-0 cursor-pointer content-start justify-stretch gap-2.5 text-left outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
				aria-pressed={chosen}
				onclick={() => media.choose(image?.url ?? false)}
			>
				<span
					class={cn(
						"relative block overflow-hidden outline-2 outline-offset-2 transition-[outline-color]",
						media.type === "poster" ? "aspect-2/3" : "aspect-video",
						media.type === "logo" || !image
							? "bg-[repeating-conic-gradient(var(--color-raised)_0_25%,var(--color-surface)_0_50%)] bg-size-[1rem_1rem]"
							: "bg-surface",
						chosen ? "outline-accent" : "outline-transparent group-hover:outline-border-strong",
					)}
				>
					{#if image}
						<img
							src={tmdbImage(image.url, "w500")}
							srcset={tmdbSrcset(image.url, srcsets[media.type])}
							sizes={media.type === "poster" ? sizes.poster : sizes.wide}
							alt="{series.title} {media.type}"
							loading="lazy"
							decoding="async"
							class={cn(
								"size-full transition-[filter] duration-150",
								media.type === "logo"
									? "object-contain p-4"
									: "object-cover brightness-90 group-hover:brightness-100",
							)}
						/>
					{:else if media.type === "logo"}
						<span
							class="grid size-full place-items-center p-4 text-center text-2xl leading-tight font-bold text-white"
						>
							<span class="line-clamp-3">{series.title}</span>
						</span>
					{/if}
				</span>
				<span
					class={cn(
						"flex flex-wrap items-center text-xs tabular-nums transition-colors",
						chosen ? "text-foreground" : "text-subtle group-hover:text-muted",
					)}
				>
					{#if image}
						<span class="metadata-tag">
							{image.language_name}
						</span>
						<span class="metadata-tag">{image.width}×{image.height}</span>
					{:else}
						No {media.type}
					{/if}
				</span>
			</button>
		</li>
	{/each}
</ul>
