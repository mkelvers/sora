<script lang="ts">
	import Icon from '$lib/components/Icon.svelte';
	import type { Series } from '@sora/sdk';
	import { getImages } from '../artwork.remote';
	import type { ArtworkFilters } from '../artwork-filters.svelte';
	import { chooseArtwork } from '../choose-artwork';

	type Props = {
		series: Series;
		filters: ArtworkFilters;
	};

	let { series, filters }: Props = $props();

	const images = $derived(await getImages(series.id));
	const shown = $derived(filters.apply(images));
	const hasType = $derived(images.some((image) => image.type === filters.type));

	const field = $derived(`${filters.type}_url` as const);
	// Compared by file name, which is the same in every TMDB size.
	const current = $derived(series[field]?.split('/').at(-1));

	const names = new Intl.DisplayNames(['en'], {
		type: 'language'
	});

	const thumbnailSizes = {
		poster: 'w342',
		backdrop: 'w780',
		logo: 'w300'
	};

	let failed = $state(false);

	async function choose(url: string) {
		try {
			await chooseArtwork(series.id, filters.type, url);
			failed = false;
		} catch {
			failed = true;
		}
	}
</script>

{#if failed}
	<p class="error" role="alert">That image couldn’t be saved.</p>
{/if}

<div class="grid {filters.type}">
	{#each shown as image (image.url)}
		{@const chosen = current === image.url.split('/').at(-1)}
		<button class="card" class:chosen aria-pressed={chosen} onclick={() => choose(image.url)}>
			<span class="image">
				<img src={image.url.replace('/original/', `/${thumbnailSizes[filters.type]}/`)} alt="" loading="lazy" />
				{#if chosen}
					<span class="badge">
						<Icon name="check" size="sm" />
						Current
					</span>
				{/if}
			</span>
			<span class="meta">
				<span>{image.width}×{image.height}</span>
				<span>{image.language ? names.of(image.language) : 'Textless'}</span>
				{#if image.season_number !== null}
					<span>{image.season_number === 0 ? 'Specials' : `Season ${image.season_number}`}</span>
				{/if}
				<span class="votes" title="{image.vote_count} votes">
					<Icon name="heart" size="xs" />
					{image.vote_average.toFixed(1)}
				</span>
			</span>
		</button>
	{:else}
		<p class="empty">
			{#if hasType}
				Nothing matches these filters.
			{:else}
				TMDB has none for this title.
			{/if}
		</p>
	{/each}
</div>

<style>
	.error {
		margin: 0 0 16px;
		color: #f28b82;
		font-size: 14px;
	}

	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(380px, 1fr));
		gap: 24px;
	}

	.grid.poster {
		grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
	}

	.card {
		display: grid;
		gap: 8px;
		padding: 0;
		border: none;
		background: none;
		color: inherit;
		font: inherit;
		text-align: left;
		cursor: pointer;
	}

	.image {
		position: relative;
		display: block;
		aspect-ratio: 16 / 9;
		background: #1c1c1c;
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

	.card:hover .image {
		outline-color: #555;
	}

	.card.chosen .image {
		outline-color: #fff;
	}

	.badge {
		position: absolute;
		top: 8px;
		left: 8px;
		display: inline-flex;
		align-items: center;
		gap: 4px;
		padding: 4px 8px 4px 6px;
		background: #fff;
		color: #101010;
		font-size: 12px;
		font-weight: 600;
	}

	.meta {
		display: flex;
		gap: 10px;
		color: #999;
		font-size: 12px;
	}

	.votes {
		display: inline-flex;
		align-items: center;
		gap: 3px;
		margin-left: auto;
	}

	.empty {
		color: #777;
	}

	button:focus-visible {
		outline: 2px solid #fff;
		outline-offset: 2px;
	}
</style>
