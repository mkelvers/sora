<script lang="ts">
	import Button from "$lib/components/ui/Button.svelte";
	import { cn, languages, tmdbImage } from "$lib/utils";
	import type { Series } from "@sora/sdk";
	import { CheckIcon, HeartIcon } from "phosphor-svelte";

	import { getImages } from "../media.remote";
	import type { Media } from "../media.svelte";

	type Props = {
		series: Series;
		media: Media;
		grid: string;
	};

	let { series, media, grid }: Props = $props();

	const images = $derived(await getImages(series.id));
	const shown = $derived(media.apply(images));
	const hasType = $derived(images.some((image) => image.type === media.type));
	const current = $derived(series[`${media.type}_url`]?.split("/").at(-1));

	const thumbnailSizes = {
		poster: "w500",
		backdrop: "w1280",
		logo: "w500",
	};
</script>

<div class={cn("grid gap-x-5 gap-y-7", grid)}>
	{#each shown as image (image.url)}
		{@const chosen = current === image.url.split("/").at(-1)}
		<Button
			class="group grid min-w-0 cursor-pointer content-start justify-stretch gap-3 text-left whitespace-normal"
			aria-pressed={chosen}
			onclick={() => media.choose(series.id, image.url)}
		>
			<span
				class={cn(
					"relative block overflow-hidden outline-2 outline-offset-2 transition-[outline-color]",
					media.type === "poster" ? "aspect-2/3" : "aspect-video",
					media.type === "logo"
						? "bg-[repeating-conic-gradient(var(--color-panel-strong)_0_25%,var(--color-surface)_0_50%)] bg-size-[1rem_1rem]"
						: "bg-surface",
					chosen ? "outline-accent" : "outline-transparent group-hover:outline-border-strong",
				)}
			>
				<img
					src={tmdbImage(image.url, thumbnailSizes[media.type])}
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
				{#if chosen}
					<span
						class="absolute top-2 right-2 grid size-7 place-items-center bg-accent text-on-accent"
						role="img"
						aria-label="Current"
					>
						<CheckIcon size="1rem" weight="bold" />
					</span>
				{/if}
			</span>
			<span class="grid gap-1">
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
			</span>
		</Button>
	{:else}
		<p class="col-span-full py-16 text-sm text-muted">
			{hasType ? "Nothing matches these filters." : "TMDB has none for this title."}
		</p>
	{/each}
</div>
