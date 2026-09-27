<script lang="ts">
	import Skeleton from '$lib/components/snippets/Skeleton.svelte';
	import Icon from '$lib/components/ui/Icon.svelte';
	import { tmdbImage, tmdbSrcset } from '$lib/utils';
	import type { ContinueWatchingItem, SeriesCard } from '@sora/sdk';

	let {
		card,
		resume = null,
		title = card?.title,
		sizes = '(min-width: 1800px) 240px, 180px'
	}: {
		card?: SeriesCard;
		resume?: ContinueWatchingItem | null;
		title?: string;
		sizes?: string;
	} = $props();

	const labels = $derived(
		[card?.audio.includes('sub') && 'Sub', card?.audio.includes('dub') && 'Dub']
			.filter(Boolean)
			.join(' | ')
	);

	const counts = $derived.by(() => {
		if (!card) {
			return [];
		}

		if (card.kind === 'movie') {
			return ['Movie'];
		}

		return [
			card.season_count > 0 && `${card.season_count} ${card.season_count === 1 ? 'Season' : 'Seasons'}`,
			card.episode_count > 0 &&
				`${card.episode_count} ${card.episode_count === 1 ? 'Episode' : 'Episodes'}`
		].filter((count) => count !== false);
	});

	const play = $derived.by(() => {
		if (!card) {
			return null;
		}

		if (resume) {
			return {
				href: `/series/${card.id}/watch/${resume.season_id}/${resume.episode}`,
				label: `${resume.position_seconds > 0 ? 'Resume' : 'Play'} episode ${resume.episode}`
			};
		}

		return (
			card.start_season_id && {
				href: `/series/${card.id}/watch/${card.start_season_id}/1`,
				label: card.kind === 'movie' ? 'Play' : 'Play episode 1'
			}
		);
	});
</script>

<div class={['poster', !card && 'pending']} aria-busy={!card || undefined}>
	<div class="image">
		{#if !card}
			<Skeleton height="100%" />
		{:else if card.poster_url}
			<img
				src={tmdbImage(card.poster_url, 'w342')}
				srcset={tmdbSrcset(card.poster_url, {
					w185: 185,
					w342: 342,
					w500: 500
				})}
				{sizes}
				alt=""
				loading="lazy"
				decoding="async"
			/>
		{:else}
			<span class="fallback">{card.title}</span>
		{/if}
	</div>

	{#if card}
		<a class="title link" href="/series/{card.id}">{card.title}</a>
	{:else if title}
		<span class="title">{title}</span>
	{:else}
		<Skeleton variant="text" width="80%" />
	{/if}

	<span class="audio">{labels}</span>

	{#if card}
		<div class="overview" aria-hidden="true">
			<span class="title">{card.title}</span>

			{#if card.score !== null}
				<span class="score">
					{(card.score / 10).toFixed(1)}
					<Icon name="star" size="xs" />
				</span>
			{/if}

			{#if counts.length > 0}
				<span class="counts">
					{#each counts as count (count)}
						<span>{count}</span>
					{/each}
				</span>
			{/if}

			{#if card.overview}
				<p>{card.overview}</p>
			{/if}
		</div>

		<div class="actions">
			{#if play}
				<a class="play" href={play.href}>
					<Icon name="play" size="sm" />
					{play.label}
				</a>
			{/if}

			<button class="watchlist" type="button" aria-label="Add to watchlist">
				<Icon name="bookmark" size="sm" />
			</button>
		</div>
	{/if}
</div>

<style>
	@layer poster {
		.poster {
			position: relative;
			display: grid;
			grid-template-rows: auto auto 1fr;
			align-content: start;
			gap: 6px;
			height: 100%;
			margin: -10px;
			padding: 10px 10px 12px;
			transition: background-color 160ms;
		}

		.poster:has(.link:focus-visible) {
			outline: 2px solid #fff;
		}

		.image {
			display: grid;
			aspect-ratio: 2 / 3;
			margin-bottom: 6px;
			overflow: hidden;
			background: #202020;
		}

		.image img {
			display: block;
			width: 100%;
			height: 100%;
			object-fit: cover;
		}

		.fallback {
			align-self: end;
			padding: 16px;
			color: #777;
			font-size: 14px;
			line-height: 1.35;
		}

		.title {
			display: -webkit-box;
			overflow: hidden;
			font-size: 14px;
			font-weight: 600;
			line-height: 1.35;
			-webkit-box-orient: vertical;
			-webkit-line-clamp: 2;
			line-clamp: 2;
		}

		.link {
			color: inherit;
			text-decoration: none;
			outline: none;
		}

		.link::after {
			content: '';
			position: absolute;
			inset: 0;
		}

		.pending .title {
			color: #bbb;
		}

		.audio {
			min-height: 1lh;
			color: #888;
			font-size: 13px;
			line-height: 1.35;
		}

		.overview {
			position: absolute;
			inset: 0;
			display: flex;
			flex-direction: column;
			gap: 8px;
			padding: 14px 12px 58px;
			overflow: hidden;
			background: rgb(20 20 20 / 0.88);
			opacity: 0;
			pointer-events: none;
			transition: opacity 160ms;
		}

		.score {
			display: flex;
			align-items: center;
			gap: 4px;
			color: #ddd;
			font-size: 13px;
		}

		.counts {
			display: grid;
			color: #999;
			font-size: 13px;
			font-weight: 600;
			line-height: 1.4;
		}

		.overview p {
			display: -webkit-box;
			flex: 0 1 auto;
			min-height: 0;
			margin: 0;
			overflow: hidden;
			color: #ccc;
			font-size: 13px;
			line-height: 1.45;
			-webkit-box-orient: vertical;
			-webkit-line-clamp: 9;
			line-clamp: 9;
		}

		.actions {
			position: absolute;
			bottom: 14px;
			left: 12px;
			display: flex;
			gap: 6px;
			visibility: hidden;
			opacity: 0;
			transition:
				opacity 160ms,
				visibility 160ms;
		}

		.play,
		.watchlist {
			display: inline-flex;
			align-items: center;
			height: 32px;
			border: none;
			font: inherit;
			font-size: 13px;
			font-weight: 600;
			text-decoration: none;
			cursor: pointer;
			transition:
				background-color 120ms,
				color 120ms;
		}

		.play {
			gap: 6px;
			padding: 0 12px 0 8px;
			background: #fff;
			color: #111;
			white-space: nowrap;
		}

		.play:hover {
			background: #ddd;
		}

		.watchlist {
			justify-content: center;
			width: 32px;
			padding: 0;
			background: rgb(255 255 255 / 0.12);
			color: #fff;
		}

		.watchlist:hover {
			background: rgb(255 255 255 / 0.22);
		}

		.play:focus-visible,
		.watchlist:focus-visible {
			outline: 2px solid #fff;
			outline-offset: 2px;
		}

		@media (hover: hover) {
			.poster:not(.pending):hover {
				background: #1c1c1c;
			}

			.poster:hover .overview,
			.poster:hover .actions {
				visibility: visible;
				opacity: 1;
			}

			.poster:hover .image img {
				position: absolute;
				inset: 0;
			}

			.poster:hover > .title,
			.poster:hover > .audio {
				opacity: 0;
			}
		}

		.poster:has(:focus-visible) .overview,
		.poster:has(:focus-visible) .actions {
			visibility: visible;
			opacity: 1;
		}

		.poster:has(:focus-visible) .image img {
			position: absolute;
			inset: 0;
		}

		.poster:has(:focus-visible) > .title,
		.poster:has(:focus-visible) > .audio {
			opacity: 0;
		}
	}
</style>
