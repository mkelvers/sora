<script lang="ts">
	import type { ContinueWatchingItem } from '@sora/sdk';
	import Icon from '$lib/components/ui/Icon.svelte';

	type Props = {
		item: ContinueWatchingItem;
	};

	let { item }: Props = $props();

	const image = $derived(item.series.backdrop_url ?? item.series.poster_url);
	const played = $derived(
		item.duration_seconds ? Math.min(item.position_seconds / item.duration_seconds, 1) : 0
	);
	const left = $derived(
		item.duration_seconds && played > 0
			? Math.max(1, Math.round((item.duration_seconds - item.position_seconds) / 60))
			: undefined
	);
</script>

<a class="resume" href="/series/{item.series.id}/watch/{item.season_id}/{item.episode}">
	<div class="image">
		{#if image}
			<img src={image} alt="" loading="lazy" decoding="async" />
		{/if}
		<span class="play" aria-hidden="true">
			<Icon name="play" />
		</span>
		{#if played > 0}
			<div class="bar" style:--played={played}></div>
		{/if}
	</div>
	<span class="title">{item.series.title}</span>
	<span class="caption">
		Episode {item.episode}
		{#if left}
			<span>· {left} min left</span>
		{:else}
			<span>· Up next</span>
		{/if}
	</span>
</a>

<style>
	.resume {
		display: flex;
		flex-direction: column;
		min-width: 0;
		color: inherit;
		text-decoration: none;
		outline: none;
	}

	.image {
		position: relative;
		aspect-ratio: 16 / 9;
		margin-bottom: 12px;
		overflow: hidden;
		background: var(--surface-2);
		transition:
			transform 280ms var(--ease),
			box-shadow 280ms var(--ease);
	}

	.image::after {
		content: '';
		position: absolute;
		inset: 0;
		background: linear-gradient(0deg, rgb(0 0 0 / 0.55), transparent 50%);
		box-shadow: 0 0 0 1px rgb(255 255 255 / 0.06) inset;
		pointer-events: none;
	}

	img {
		display: block;
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.play {
		position: absolute;
		inset: 0;
		z-index: 1;
		display: grid;
		place-items: center;
		margin: auto;
		width: 52px;
		height: 52px;
		border-radius: 50%;
		background: rgb(255 255 255 / 0.9);
		color: var(--bg);
		opacity: 0;
		transform: scale(0.9);
		transition:
			opacity 200ms var(--ease),
			transform 200ms var(--ease);
	}

	.resume:hover .image {
		transform: translateY(-4px);
		box-shadow: 0 16px 32px -12px rgb(0 0 0 / 0.8);
	}

	.resume:hover .play,
	.resume:focus-visible .play {
		opacity: 1;
		transform: none;
	}

	.resume:focus-visible .image {
		outline: 2px solid var(--text);
		outline-offset: 3px;
	}

	.bar {
		position: absolute;
		inset: auto 12px 12px;
		z-index: 1;
		height: 4px;
		border-radius: 2px;
		background: rgb(255 255 255 / 0.25);
		overflow: hidden;
	}

	.bar::after {
		content: '';
		position: absolute;
		inset: 0 auto 0 0;
		width: calc(var(--played) * 100%);
		background: var(--accent);
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

	@media (prefers-reduced-motion: reduce) {
		.image,
		.play {
			transition: none;
		}

		.resume:hover .image {
			transform: none;
		}
	}
</style>
