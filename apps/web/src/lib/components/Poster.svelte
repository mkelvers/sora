<script lang="ts">
	import { BookmarkSimpleIcon, PlayIcon, StarIcon } from 'phosphor-svelte';
	import CardMedia from '$lib/components/ui/CardMedia.svelte';
	import ProgressiveImage from '$lib/components/ui/ProgressiveImage.svelte';
	import Skeleton from '$lib/components/snippets/Skeleton.svelte';
	import Tooltip from '$lib/components/ui/Tooltip.svelte';
	import { cn } from '$lib/utils';
	import { getListed, setListed } from '$lib/watchlist.remote';
	import type { ContinueWatchingItem, SeriesCard } from '@sora/sdk';

	let {
		card,
		resume = null,
		title = card?.title,
		meta,
		class: className,
	}: {
		card?: SeriesCard;
		resume?: ContinueWatchingItem | null;
		title?: string;
		meta?: string;
		class?: string;
	} = $props();

	const listing = getListed();
	const listed = $derived(!!card && !!listing.current?.includes(card.id));

	const audio = $derived(audioLabel(card?.audio));

	const play = $derived.by(() => {
		if (!card) {
			return null;
		}

		if (resume) {
			return {
				href: `/series/${card.id}/watch/${resume.season_id}/${resume.episode}`,
				label: `${resume.position_seconds > 0 ? 'Resume' : 'Play'} E${resume.episode}`,
			};
		}

		return (
			card.start_season_id && {
				href: `/series/${card.id}/watch/${card.start_season_id}/1`,
				label: card.kind === 'movie' ? 'Play' : 'Play E1',
			}
		);
	});
</script>

<article class={cn('group relative isolate min-w-0 text-foreground focus-within:z-10 hover:z-10', className)}>
	{#if !card}
		<div aria-busy="true">
			<CardMedia aspect="poster">
				<Skeleton class="size-full" />
			</CardMedia>
			{#if title}
				<h3 class="mt-3 line-clamp-2 min-h-10 text-sm leading-snug font-semibold text-muted">{title}</h3>
			{:else}
				<Skeleton class="mt-3 h-4 w-4/5" />
			{/if}
		</div>
	{:else}
		<div class="transition-opacity duration-150 group-hover:opacity-0 group-focus-within:opacity-0">
			<a
				href="/series/{card.id}"
				class="block focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
			>
				<CardMedia aspect="poster">
					{#if card.poster_url}
						<ProgressiveImage
							src={card.poster_url}
							alt=""
							displaySize="w500"
							sizes="(min-width: 1024px) 14rem, 45vw"
						/>
					{:else}
						<span class="grid size-full items-end p-4 text-sm text-subtle">{card.title}</span>
					{/if}
				</CardMedia>
				<h3 class="mt-3 line-clamp-2 min-h-10 text-sm leading-snug font-semibold">{card.title}</h3>
				{#if meta}
					<p class="mt-1.5 text-sm text-muted">{meta}</p>
				{/if}
				{#if audio}
					<p class="mt-1.5 text-sm text-muted">{audio}</p>
				{/if}
			</a>
		</div>

		{#if card.poster_url}
			<ProgressiveImage
				src={card.poster_url}
				alt=""
				displaySize="w500"
				sizes="(min-width: 1024px) 14rem, 45vw"
				class="pointer-events-none absolute -inset-2 size-auto opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100"
			/>
		{/if}

		<div
			class="pointer-events-none absolute -inset-2 flex flex-col bg-header-hover/95 p-4 pt-6 opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100"
		>
			<div aria-hidden="true">
				<h3 class="line-clamp-2 text-sm leading-snug font-semibold">{card.title}</h3>
				{#if card.score !== null}
					<p class="mt-3 flex items-center gap-1 text-sm text-muted">
						<span>{(card.score / 10).toFixed(1)}</span>
						<StarIcon size="1em" weight="fill" />
					</p>
				{/if}
				<p class="mt-3 text-xs font-semibold text-muted">
					{#if card.kind === 'movie'}
						Movie
					{:else}
						{[
							card.season_count > 0 && `${card.season_count} ${card.season_count === 1 ? 'Season' : 'Seasons'}`,
							card.episode_count > 0 &&
								`${card.episode_count} ${card.episode_count === 1 ? 'Episode' : 'Episodes'}`,
						]
							.filter((part) => !!part)
							.join(' · ')}
					{/if}
				</p>
				{#if card.genres.length}
					<p class="mt-2 line-clamp-1 text-xs text-muted">{card.genres.slice(0, 3).join(' · ')}</p>
				{/if}
				{#if card.overview}
					<p class="mt-3 line-clamp-6 text-xs leading-relaxed text-muted">{card.overview}</p>
				{/if}
			</div>

			<div class="pointer-events-auto mt-auto flex items-center gap-2 pt-3 text-accent">
				{#if play}
					<Tooltip text={play.label}>
						<a
							href={play.href}
							class="grid size-9 place-items-center transition-[opacity,transform] duration-150 hover:opacity-80 active:scale-90"
							aria-label={play.label}
						>
							<PlayIcon size="1.55rem" weight="bold" />
						</a>
					</Tooltip>
				{/if}

				<Tooltip text={listed ? 'Remove from Watchlist' : 'Add to Watchlist'}>
					<button
						type="button"
						class="grid size-9 cursor-pointer place-items-center transition-[filter,transform] duration-150 hover:brightness-110 active:scale-90"
						aria-label={listed ? 'Remove from Watchlist' : 'Add to Watchlist'}
						aria-pressed={listed}
						onclick={() =>
							setListed({
								seriesId: card.id,
								listed: !listed,
							}).updates(
								listing.withOverride((ids) =>
									listed ? ids.filter((id) => id !== card.id) : [...ids, card.id]
								)
							)}
					>
						<BookmarkSimpleIcon size="1.55rem" weight={listed ? 'fill' : 'bold'} />
					</button>
				</Tooltip>
			</div>
		</div>
	{/if}
</article>
