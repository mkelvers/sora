<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { SeriesCard } from '@sora/sdk';

	type Props = {
		series: SeriesCard;
		/** Replaces the year under the title. */
		caption?: Snippet;
	};

	let { series, caption }: Props = $props();
</script>

<a class="poster" href="/series/{series.id}">
	<div class="image">
		{#if series.poster_url}
			<img src={series.poster_url} alt="" loading="lazy" decoding="async" />
		{:else}
			<span>{series.title}</span>
		{/if}
	</div>
	<span class="title">{series.title}</span>
	{#if caption}
		<span class="caption">{@render caption()}</span>
	{:else if series.year}
		<span class="caption">
			{series.year}{#if series.status === 'RELEASING'}<span class="airing">· Airing</span>{/if}
		</span>
	{/if}
</a>

<style>
	.poster {
		display: flex;
		flex-direction: column;
		min-width: 0;
		color: inherit;
		text-decoration: none;
		outline: none;
	}

	.image {
		position: relative;
		display: grid;
		place-items: center;
		aspect-ratio: 2 / 3;
		margin-bottom: 12px;
		overflow: hidden;
		background: var(--surface-2);
		box-shadow: 0 0 0 1px var(--line) inset;
		transition:
			transform 280ms var(--ease),
			box-shadow 280ms var(--ease);
	}

	.image span {
		padding: 16px;
		color: var(--text-3);
		font-size: 14px;
		text-align: center;
	}

	img {
		display: block;
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	/* A thin sheen over the art, so light posters keep an edge on the dark page. */
	.image::after {
		content: '';
		position: absolute;
		inset: 0;
		box-shadow: 0 0 0 1px rgb(255 255 255 / 0.06) inset;
		pointer-events: none;
	}

	.poster:hover .image {
		transform: translateY(-4px);
		box-shadow: 0 16px 32px -12px rgb(0 0 0 / 0.8);
	}

	.poster:focus-visible .image {
		outline: 2px solid var(--text);
		outline-offset: 3px;
	}

	.title {
		overflow: hidden;
		font-size: 14px;
		font-weight: 500;
		line-height: 1.35;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.caption {
		margin-top: 2px;
		color: var(--text-3);
		font-size: 13px;
	}

	.airing {
		margin-left: 4px;
		color: var(--accent);
	}

	@media (prefers-reduced-motion: reduce) {
		.image {
			transition: none;
		}

		.poster:hover .image {
			transform: none;
		}
	}
</style>
