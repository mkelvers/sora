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
	{#if series.poster_url}
		<img src={series.poster_url} alt="" loading="lazy" decoding="async" />
	{:else}
		<div class="image"></div>
	{/if}
	<span class="title">{series.title}</span>
	{#if caption}
		<span class="caption">{@render caption()}</span>
	{:else if series.year}
		<span class="caption">{series.year}</span>
	{/if}
</a>

<style>
	.poster {
		display: flex;
		flex-direction: column;
		gap: 4px;
		min-width: 0;
		color: inherit;
		text-decoration: none;
	}

	img,
	.image {
		display: block;
		width: 100%;
		aspect-ratio: 2 / 3;
		margin-bottom: 4px;
		object-fit: cover;
		background: #2a2a2a;
		transition: filter 120ms;
	}

	.poster:hover img {
		filter: brightness(1.15);
	}

	.poster:focus-visible {
		outline: 2px solid #fff;
		outline-offset: 4px;
	}

	.title {
		overflow: hidden;
		font-size: 15px;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.caption {
		color: #999;
		font-size: 13px;
	}
</style>
