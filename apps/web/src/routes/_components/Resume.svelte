<script lang="ts">
	import type { ContinueWatchingItem } from '@sora/sdk';

	type Props = {
		item: ContinueWatchingItem;
	};

	let { item }: Props = $props();

	const image = $derived(item.series.backdrop_url ?? item.series.poster_url);
	const played = $derived(
		item.duration_seconds ? Math.min(item.position_seconds / item.duration_seconds, 1) : 0
	);
</script>

<a class="resume" href="/series/{item.series.id}/watch/{item.season_id}/{item.episode}">
	<div class="image">
		{#if image}
			<img src={image} alt="" loading="lazy" decoding="async" />
		{/if}
		{#if played > 0}
			<div class="bar" style:--played={played}></div>
		{/if}
	</div>
	<span class="title">{item.series.title}</span>
	<span class="caption">{played > 0 ? 'Continue' : 'Up next'} · Episode {item.episode}</span>
</a>

<style>
	.resume {
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
		color: inherit;
		text-align: center;
		text-decoration: none;
	}

	.image {
		position: relative;
		aspect-ratio: 16 / 9;
		margin-bottom: 6px;
		background: #2a2a2a;
	}

	img {
		display: block;
		width: 100%;
		height: 100%;
		object-fit: cover;
		transition: filter 120ms;
	}

	.resume:hover img {
		filter: brightness(1.15);
	}

	.resume:focus-visible {
		outline: 2px solid #fff;
		outline-offset: 4px;
	}

	.bar {
		position: absolute;
		inset: auto 0 0;
		height: 4px;
		background: rgb(255 255 255 / 0.25);
	}

	.bar::after {
		content: '';
		position: absolute;
		inset: 0 auto 0 0;
		width: calc(var(--played) * 100%);
		background: #e6e6e6;
	}

	.title {
		overflow: hidden;
		font-size: 14px;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.caption {
		color: #999;
		font-size: 13px;
	}
</style>
