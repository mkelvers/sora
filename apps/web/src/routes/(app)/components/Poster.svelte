<script lang="ts">
	import Skeleton from "$lib/components/snippets/Skeleton.svelte";
	import Button from "$lib/components/ui/Button.svelte";
	import Image from "$lib/components/ui/Image.svelte";
	import Tooltip from "$lib/components/ui/Tooltip.svelte";
	import { audioLabel, cn, tmdbImage, tmdbSrcset } from "$lib/utils";
	import { getLibrary } from "$routes/(app)/library.svelte";
	import type { SeriesCard } from "@sora/sdk";
	import { BookmarkSimpleIcon, PlayIcon, StarIcon } from "phosphor-svelte";

	let {
		card,
		meta,
		class: className,
	}: {
		card?: SeriesCard;
		meta?: string;
		class?: string;
	} = $props();

	const library = getLibrary();
	const listed = $derived(!!card && library.status.has(card.id));

	const audio = $derived(audioLabel(card?.audio));

	function toggleListed() {
		if (!card) {
			return;
		}

		library.set(card, listed ? null : "plan_to_watch");
	}

	const play = $derived.by(() => {
		if (!card) {
			return null;
		}

		if (!card.episode_count) {
			return {
				href: `/series/${card.id}`,
				label: "Play",
			};
		}

		const resume = library.resume.get(card.id);
		if (resume) {
			const verb = resume.position_seconds > 0 ? "Resume" : "Play";
			return {
				href: `/series/${card.id}/watch/${resume.episode}`,
				label: card.format === "MOVIE" ? verb : `${verb} E${resume.episode}`,
			};
		}

		return {
			href: `/series/${card.id}/watch/1`,
			label: card.format === "MOVIE" ? "Play" : "Play E1",
		};
	});
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
				{#if listed}
					<span
						data-listed
						class="absolute top-0 right-0 isolate size-10 text-accent after:absolute after:inset-0 after:-z-10 after:bg-black/80 after:[clip-path:polygon(0_0,100%_0,100%_100%)]"
					>
						<BookmarkSimpleIcon
							class="absolute top-0.5 right-1"
							size="1rem"
							weight="fill"
							aria-hidden="true"
						/>
						<span class="sr-only">On your watchlist</span>
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
			class="pointer-events-none absolute -inset-2 flex flex-col bg-surface/95 p-4 pt-6 opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-has-focus-visible:opacity-100"
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
					{#if card.format === "MOVIE"}
						Movie
					{:else if card.episode_count > 0}
						{card.episode_count}
						{card.episode_count === 1 ? "Episode" : "Episodes"}
					{/if}
				</p>
				{#if card.overview}
					<p class="mt-3 line-clamp-6 text-xs leading-relaxed text-muted">{card.overview}</p>
				{/if}
			</div>

			<div class="pointer-events-auto mt-auto flex items-center gap-2 pt-3">
				{#if play}
					<Tooltip text={play.label}>
						{#snippet children(trigger)}
							<Button
								{...trigger}
								href={play.href}
								variant="primary"
								size="sm"
								square
								aria-label={play.label}
							>
								<PlayIcon size="1.25rem" weight="fill" />
							</Button>
						{/snippet}
					</Tooltip>
				{/if}

				<Tooltip text={listed ? "Remove from watchlist" : "Add to watchlist"}>
					{#snippet children(trigger)}
						<Button
							{...trigger}
							variant="secondary"
							size="sm"
							square
							aria-label={listed ? "Remove from watchlist" : "Add to watchlist"}
							aria-pressed={listed}
							onclick={toggleListed}
						>
							<BookmarkSimpleIcon size="1.25rem" weight={listed ? "fill" : "bold"} />
						</Button>
					{/snippet}
				</Tooltip>
			</div>
		</div>
	{/if}
</article>
