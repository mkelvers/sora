<script lang="ts">
	import Button from '$lib/components/ui/Button.svelte';
	import Icon from '$lib/components/ui/Icon.svelte';
	import type { Series } from '@sora/sdk';
	import { getImages } from '../artwork.remote';
	import type { Artwork } from '../artwork.svelte';
	import { formatLanguage, formatSeason } from '$lib/utils';

	type Props = {
		series: Series;
		artwork: Artwork;
	};

	let { series, artwork }: Props = $props();

	const images = $derived(await getImages(series.id));
	const shown = $derived(artwork.apply(images));
	const hasType = $derived(images.some((image) => image.type === artwork.type));

	const field = $derived(`${artwork.type}_url` as const);
	const current = $derived(series[field]?.split('/').at(-1));

	const thumbnailSizes = {
		poster: 'w342',
		backdrop: 'w780',
		logo: 'w300'
	};
</script>

<div class="grid {artwork.type}">
	{#each shown as image (image.url)}
		{@const chosen = current === image.url.split('/').at(-1)}
		{@const thumbnail = image.url.replace('/original/', `/${thumbnailSizes[artwork.type]}/`)}
		<Button
			class={['card', { chosen }]}
			aria-pressed={chosen}
			onclick={() => artwork.choose(series.id, image.url)}
		>
			<span class="image">
				<img src={thumbnail} alt="" loading="lazy" decoding="async" />
				{#if chosen}
					<span class="check" title="Current">
						<Icon name="check" size="sm" />
					</span>
				{/if}
			</span>
			<span class="text">
				<span class="title">{formatLanguage(image.language)}</span>
				<span class="meta">
					<span>{image.width}×{image.height}</span>
					{#if image.season_number !== null}
						<span>{formatSeason(image.season_number)}</span>
					{/if}
					<span class="votes" title="{image.vote_count} votes">
						<Icon name="heart" size="xs" />
						{image.vote_average.toFixed(1)}
					</span>
				</span>
			</span>
		</Button>
	{:else}
		<p class="empty">
			{#if hasType}
				Nothing matches these artwork.
			{:else}
				TMDB has none for this title.
			{/if}
		</p>
	{/each}
</div>

<style>
	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
		gap: 28px 16px;
	}

	.grid.poster {
		grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
	}

	.grid :global(.card) {
		display: grid;
		justify-content: stretch;
		align-content: start;
		gap: 10px;
		font-size: inherit;
		white-space: normal;
		text-align: center;
	}

	.image {
		position: relative;
		display: block;
		aspect-ratio: 16 / 9;
		background: #2a2a2a;
		outline: 2px solid transparent;
		outline-offset: 2px;
		transition: outline-color 120ms;
	}

	.poster .image {
		aspect-ratio: 2 / 3;
	}

	.logo .image {
		background: repeating-conic-gradient(#1c1c1c 0% 25%, #242424 0% 50%) 0 0 / 20px 20px;
	}

	.image img {
		display: block;
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.logo .image img {
		box-sizing: border-box;
		padding: 16px;
		object-fit: contain;
	}

	:global(.card:hover) .image {
		outline-color: #555;
	}

	:global(.card.chosen) .image {
		outline-color: #fff;
	}

	.check {
		position: absolute;
		top: 8px;
		right: 8px;
		display: grid;
		place-items: center;
		width: 28px;
		height: 28px;
		border-radius: 50%;
		background: #fff;
		color: #101010;
		box-shadow: 0 1px 4px rgb(0 0 0 / 0.4);
	}

	.text {
		display: grid;
		gap: 4px;
	}

	.title {
		font-size: 15px;
	}

	.meta {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		align-items: center;
		gap: 4px 8px;
		color: #999;
		font-size: 13px;
	}

	.meta > span + span::before {
		content: '';
		display: inline-block;
		width: 4px;
		height: 4px;
		margin-right: 8px;
		background: currentColor;
		vertical-align: middle;
		rotate: 45deg;
	}

	.votes {
		display: inline-flex;
		align-items: center;
		gap: 3px;
	}

	.empty {
		grid-column: 1 / -1;
		margin: 0;
		color: #999;
	}
</style>
