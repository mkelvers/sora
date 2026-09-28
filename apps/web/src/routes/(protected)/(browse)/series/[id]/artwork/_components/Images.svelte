<script lang="ts">
	import Button from "$lib/components/ui/Button.svelte";
	import { cn } from "$lib/utils";
	import { languages } from "$lib/utils";
	import type { Series } from "@sora/sdk";
	import { CheckIcon, HeartIcon } from "phosphor-svelte";

	import { getImages } from "../artwork.remote";
	import type { Artwork } from "../artwork.svelte";

	type Props = {
		series: Series;
		artwork: Artwork;
	};

	let { series, artwork }: Props = $props();

	const images = $derived(await getImages(series.id));
	const shown = $derived(artwork.apply(images));
	const hasType = $derived(images.some((image) => image.type === artwork.type));

	const field = $derived(`${artwork.type}_url` as const);
	const current = $derived(series[field]?.split("/").at(-1));

	const thumbnailSizes = {
		poster: "w342",
		backdrop: "w780",
		logo: "w300",
	};
</script>

<div
	class={cn(
		"grid gap-x-5 gap-y-8",
		artwork.type === "poster"
			? "grid-cols-2 sm:grid-cols-4 xl:grid-cols-6"
			: "grid-cols-1 sm:grid-cols-2 xl:grid-cols-3",
	)}
>
	{#each shown as image (image.url)}
		{@const chosen = current === image.url.split("/").at(-1)}
		<Button
			class="group grid min-w-0 cursor-pointer justify-stretch gap-3 text-left"
			aria-pressed={chosen}
			onclick={() => artwork.choose(series.id, image.url)}
		>
			<span
				class={cn(
					"relative block overflow-hidden bg-surface outline-2 outline-offset-2 transition-[outline-color]",
					artwork.type === "poster" ? "aspect-2/3" : "aspect-video",
					chosen ? "outline-accent" : "outline-transparent group-hover:outline-border-strong",
				)}
			>
				<img
					src={image.url.replace("/original/", `/${thumbnailSizes[artwork.type]}/`)}
					alt=""
					loading="lazy"
					decoding="async"
					class="size-full object-cover"
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
				<span class="text-sm font-semibold"
					>{image.language ? languages.of(image.language) : "Textless"}</span
				>
				<span class="flex flex-wrap items-center gap-x-3 text-xs text-muted">
					<span>{image.width}×{image.height}</span>
					{#if image.season_number !== null}
						<span>{image.season_number === 0 ? "Specials" : `Season ${image.season_number}`}</span>
					{/if}
					<span class="inline-flex items-center gap-1">
						<HeartIcon size="0.8rem" weight="fill" />
						{image.vote_average.toFixed(1)}
					</span>
				</span>
			</span>
		</Button>
	{:else}
		<p class="col-span-full py-10 text-muted">
			{hasType ? "Nothing matches these filters." : "TMDB has none for this title."}
		</p>
	{/each}
</div>
