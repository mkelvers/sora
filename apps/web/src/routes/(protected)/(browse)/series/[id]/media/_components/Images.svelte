<script lang="ts">
	import Button from "$lib/components/ui/Button.svelte";
	import { cn, languages, tmdbImage, tmdbSrcset } from "$lib/utils";
	import type { Series } from "@sora/sdk";
	import { HeartIcon } from "phosphor-svelte";
	import type { Snippet } from "svelte";

	import { getImages } from "../media.remote";
	import type { Media } from "../media.svelte";

	type Props = {
		series: Series;
		media: Media;
	};

	let { series, media }: Props = $props();

	const images = $derived(await getImages(series.id));
	const shown = $derived(media.apply(images));
	const current = $derived(series[`${media.type}_url`]?.split("/").at(-1));

	const thumbnails = {
		poster: {
			srcset: {
				w342: 342,
				w500: 500,
				w780: 780,
			},
			sizes:
				"(min-width: 80rem) 12vw, (min-width: 64rem) 16vw, (min-width: 48rem) 22vw, (min-width: 40rem) 30vw, 45vw",
		},
		backdrop: {
			srcset: {
				w780: 780,
				w1280: 1280,
			},
			sizes: "(min-width: 80rem) 25vw, (min-width: 64rem) 35vw, (min-width: 40rem) 45vw, 90vw",
		},
		logo: {
			srcset: {
				w300: 300,
				w500: 500,
			},
			sizes: "(min-width: 80rem) 25vw, (min-width: 64rem) 35vw, (min-width: 40rem) 45vw, 90vw",
		},
	};
</script>

{#snippet tile(chosen: boolean, url: string | false, preview: Snippet, details: Snippet)}
	<Button
		class="group grid min-w-0 cursor-pointer content-start justify-stretch gap-3 text-left whitespace-normal"
		aria-pressed={chosen}
		onclick={() => media.choose(series.id, url)}
	>
		<span
			class={cn(
				"relative block overflow-hidden outline-2 outline-offset-2 transition-[outline-color]",
				media.type === "poster" ? "aspect-2/3" : "aspect-video",
				media.type === "logo" || !url
					? "bg-[repeating-conic-gradient(var(--color-panel-strong)_0_25%,var(--color-surface)_0_50%)] bg-size-[1rem_1rem]"
					: "bg-surface",
				chosen ? "outline-accent" : "outline-transparent group-hover:outline-border-strong",
			)}
		>
			{@render preview()}
		</span>
		<span class="grid gap-1">
			{@render details()}
		</span>
	</Button>
{/snippet}

<div
	class={cn(
		"grid gap-x-5 gap-y-7",
		media.type === "poster"
			? "grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6"
			: "grid-cols-1 sm:grid-cols-2 xl:grid-cols-3",
	)}
>
	{#if media.type !== "poster"}
		{#snippet preview()}
			{#if media.type === "logo"}
				<span
					class="grid size-full place-items-center p-4 text-center text-2xl leading-tight font-bold text-white"
				>
					<span class="line-clamp-3">{series.title}</span>
				</span>
			{/if}
		{/snippet}
		{#snippet details()}
			<span class="truncate text-sm font-medium text-foreground">
				{media.type === "logo" ? "No logo" : "No backdrop"}
			</span>
			<span class="text-xs text-subtle">
				{media.type === "logo" ? "Shows the title instead" : "Leaves the page plain"}
			</span>
		{/snippet}
		{@render tile(series[`${media.type}_url`] === null, false, preview, details)}
	{/if}

	{#each shown as image (image.url)}
		{#snippet preview()}
			<img
				src={tmdbImage(image.url, "w500")}
				srcset={tmdbSrcset(image.url, thumbnails[media.type].srcset)}
				sizes={thumbnails[media.type].sizes}
				alt=""
				loading="lazy"
				decoding="async"
				class={cn(
					"size-full transition-[filter] duration-150",
					media.type === "logo"
						? "object-contain p-4"
						: "object-cover brightness-90 group-hover:brightness-100",
				)}
			/>
		{/snippet}
		{#snippet details()}
			<span class="truncate text-sm font-medium text-foreground">
				{image.language ? languages.of(image.language) : "Textless"}
			</span>
			<span class="flex flex-wrap items-center text-xs text-subtle tabular-nums">
				<span class="metadata-tag">{image.width}×{image.height}</span>
				{#if image.season_number !== null}
					<span class="metadata-tag">
						{image.season_number === 0 ? "Specials" : `Season ${image.season_number}`}
					</span>
				{/if}
				<span class="metadata-tag inline-flex items-center gap-1">
					<HeartIcon size="0.75rem" weight="fill" />
					{image.vote_average.toFixed(1)}
				</span>
			</span>
		{/snippet}
		{@render tile(current === image.url.split("/").at(-1), image.url, preview, details)}
	{/each}
</div>
