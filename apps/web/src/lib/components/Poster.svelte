<script lang="ts">
	import Skeleton from "$lib/components/snippets/Skeleton.svelte";
	import Button from "$lib/components/ui/Button.svelte";
	import Image from "$lib/components/ui/Image.svelte";
	import Tooltip from "$lib/components/ui/Tooltip.svelte";
	import { audioLabel, cn, tmdbImage, tmdbSrcset } from "$lib/utils";
	import type { SeriesCard } from "@sora/sdk";
	import { PlayIcon, StarIcon } from "phosphor-svelte";

	let {
		card,
		meta,
		class: className,
	}: {
		card?: SeriesCard;
		meta?: string;
		class?: string;
	} = $props();

	const audio = $derived(audioLabel(card?.audio));

	const play = $derived(
		card?.start_season_id
			? {
					href: `/series/${card.id}/watch/${card.start_season_id}/1`,
					label: card.kind === "movie" ? "Play" : "Play E1",
				}
			: null,
	);
</script>

<article
	class={cn(
		"group relative isolate min-w-0 text-foreground hover:z-10 has-focus-visible:z-10",
		className,
	)}
>
	{#if !card}
		<div aria-busy="true">
			<div class="relative aspect-2/3 overflow-hidden bg-surface">
				<Skeleton class="size-full" />
			</div>
			<Skeleton class="mt-3 h-4 w-4/5" />
		</div>
	{:else}
		<a
			href="/series/{card.id}"
			class="block transition-opacity duration-150 group-hover:opacity-0 group-has-focus-visible:opacity-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
		>
			<div class="relative aspect-2/3 overflow-hidden bg-surface">
				{#if card.poster_url}
					<Image
						src={tmdbImage(card.poster_url, "w500")}
						srcset={tmdbSrcset(card.poster_url, {
							w342: 342,
							w500: 500,
							w780: 780,
						})}
						sizes="(min-width: 120rem) 14vw, (min-width: 96rem) 16vw, (min-width: 64rem) 20vw, (min-width: 48rem) 25vw, (min-width: 30em) 33vw, 50vw"
						alt="Poster for {card.title}"
					/>
				{:else}
					<span class="grid size-full items-end p-4 text-sm text-subtle" aria-hidden="true">
						{card.title}
					</span>
				{/if}
			</div>
			<h3 class="mt-3 line-clamp-2 text-sm leading-snug font-semibold">{card.title}</h3>
			{#if meta}
				<p class="mt-1.5 text-sm text-muted">{meta}</p>
			{/if}
			{#if audio}
				<p class="mt-1.5 text-sm text-muted">{audio}</p>
			{/if}
		</a>

		{#if card.poster_url}
			<div
				class="pointer-events-none absolute -inset-2 opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-has-focus-visible:opacity-100"
				aria-hidden="true"
			>
				<Image
					src={tmdbImage(card.poster_url, "w500")}
					srcset={tmdbSrcset(card.poster_url, {
						w342: 342,
						w500: 500,
						w780: 780,
					})}
					sizes="(min-width: 120rem) 14vw, (min-width: 96rem) 16vw, (min-width: 64rem) 20vw, (min-width: 48rem) 25vw, (min-width: 30em) 33vw, 50vw"
					alt="Poster for {card.title}"
				/>
			</div>
		{/if}

		<div
			class="pointer-events-none absolute -inset-2 flex flex-col bg-header-hover/95 p-4 pt-6 opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-has-focus-visible:opacity-100"
		>
			<div class="min-h-0 flex-1 overflow-hidden mask-b-from-80%" aria-hidden="true">
				<h3 class="line-clamp-2 text-sm leading-snug font-semibold">{card.title}</h3>
				{#if card.score !== null}
					<p class="mt-3 flex items-center gap-1 text-sm text-muted">
						{(card.score / 10).toFixed(1)}
						<StarIcon size="1em" weight="fill" />
					</p>
				{/if}
				<p class="mt-3 flex flex-col gap-0.5 text-xs font-semibold text-muted">
					{#if card.kind === "movie"}
						Movie
					{:else}
						{#if card.season_count > 0}
							<span>{card.season_count} {card.season_count === 1 ? "Season" : "Seasons"}</span>
						{/if}
						{#if card.episode_count > 0}
							<span>{card.episode_count} {card.episode_count === 1 ? "Episode" : "Episodes"}</span>
						{/if}
					{/if}
				</p>
				{#if card.overview}
					<p class="mt-3 line-clamp-6 text-xs leading-relaxed text-muted">{card.overview}</p>
				{/if}
			</div>

			{#if play}
				<div class="pointer-events-auto mt-auto flex items-center gap-2 pt-3">
					<Tooltip text={play.label}>
						{#snippet children(trigger)}
							<Button
								{...trigger}
								href={play.href}
								variant="icon"
								tone="accent"
								aria-label={play.label}
							>
								<PlayIcon size="1.55rem" weight="bold" />
							</Button>
						{/snippet}
					</Tooltip>
				</div>
			{/if}
		</div>
	{/if}
</article>
