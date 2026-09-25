<script lang="ts">
	import Icon from '$lib/components/Icon.svelte';
	import type { Series, SeriesImage } from '@sora/sdk';
	import { getImages, getSeries, setArtwork } from '$lib/remote/anime.remote';

	type Props = {
		series: Series;
		type: SeriesImage['type'];
		sort: 'votes' | 'quality';
	};

	let { series, type, sort }: Props = $props();

	const images = $derived(
		await getImages({
			seriesId: series.id,
			type,
			sort
		})
	);

	let language = $state('all');
	const languages = $derived([...new Set(images.map((image) => image.language ?? 'none'))]);
	const shown = $derived(images.filter((image) => language === 'all' || (image.language ?? 'none') === language));

	const field = $derived(`${type}_url` as const);
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

	async function choose(url: string | null) {
		const title = getSeries(series.id);
		const saving = setArtwork({
			seriesId: series.id,
			type,
			url
		});

		try {
			if (url) {
				await saving.updates(
					title.withOverride((series) => ({
						...series,
						[field]: url
					}))
				);
			} else {
				await saving.updates(title);
			}
			failed = false;
		} catch {
			failed = true;
		}
	}
</script>

<header>
	<div class="languages" role="radiogroup" aria-label="Language">
		{#each ['all', ...languages] as code (code)}
			<button role="radio" aria-checked={language === code} onclick={() => (language = code)}>
				{#if code === 'all'}
					All
				{:else if code === 'none'}
					Textless
				{:else}
					{names.of(code)}
				{/if}
			</button>
		{/each}
	</div>

	<button class="reset" onclick={() => choose(null)}>Use default</button>
</header>

{#if failed}
	<p class="error" role="alert">That image couldn’t be saved.</p>
{/if}

<div class="grid {type}">
	{#each shown as image (image.url)}
		{@const chosen = current === image.url.split('/').at(-1)}
		<button class="card" class:chosen aria-pressed={chosen} onclick={() => choose(image.url)}>
			<span class="image">
				<img src={image.url.replace('/original/', `/${thumbnailSizes[type]}/`)} alt="" loading="lazy" />
				{#if chosen}
					<span class="badge">
						<Icon name="check" size={16} />
						Current
					</span>
				{/if}
			</span>
			<span class="meta">
				<span>{image.width}×{image.height}</span>
				<span>{image.language ? names.of(image.language) : 'Textless'}</span>
				<span class="votes" title="{image.vote_count} votes">
					<Icon name="heart" size={12} />
					{image.vote_average.toFixed(1)}
				</span>
			</span>
		</button>
	{:else}
		<p class="empty">TMDB has none for this title.</p>
	{/each}
</div>

<style>
	header {
		display: flex;
		align-items: flex-start;
		gap: 16px;
		margin-bottom: 24px;
	}

	.languages {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}

	.languages button,
	.reset {
		padding: 6px 12px;
		border: 1px solid #333;
		background: none;
		color: #999;
		font: inherit;
		font-size: 13px;
		cursor: pointer;
	}

	.languages button:hover,
	.reset:hover {
		border-color: #555;
		color: #fff;
	}

	.languages button[aria-checked='true'] {
		border-color: #e6e6e6;
		background: #e6e6e6;
		color: #101010;
	}

	.reset {
		flex: none;
		margin-left: auto;
		color: #e6e6e6;
	}

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
