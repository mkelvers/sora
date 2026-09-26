<script lang="ts">
	import type { Snippet } from 'svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Icon from '$lib/components/ui/Icon.svelte';
	import { formatClock } from '$lib/utils';
	import type { Player } from '../watch.svelte';

	type Props = {
		player: Player;
		previous?: string;
		next?: string;
		children?: Snippet;
	};

	let { player, previous, next, children }: Props = $props();

	const percent = (value: number, max: number) => `${max > 0 ? (value / max) * 100 : 0}%`;
</script>

<input
	class="range"
	type="range"
	min="0"
	max={player.duration || 0}
	step="any"
	bind:value={player.time}
	aria-label="Seek"
	aria-valuetext="{formatClock(player.time)} of {formatClock(player.duration)}"
	style:--fill={percent(player.time, player.duration)}
	style:--loaded={percent(player.loaded, player.duration)}
/>

<div class="controls">
	{#if previous}
		<a class="icon-button" href={previous} aria-label="Previous episode">
			<Icon name="previous" />
		</a>
	{/if}
	<Button class="icon-button" onclick={() => player.seek(-10)} aria-label="Rewind 10 seconds">
		<Icon name="rewind" />
	</Button>
	<Button class="icon-button" onclick={player.toggle} aria-label={player.paused ? 'Play' : 'Pause'}>
		<Icon name={player.paused ? 'play' : 'pause'} />
	</Button>
	<Button class="icon-button" onclick={() => player.seek(10)} aria-label="Forward 10 seconds">
		<Icon name="forward" />
	</Button>
	{#if next}
		<a class="icon-button" href={next} aria-label="Next episode">
			<Icon name="next" />
		</a>
	{/if}

	<span class="time">{formatClock(player.time)} / {formatClock(player.duration)}</span>

	<Button class="icon-button" onclick={() => (player.muted = !player.muted)} aria-label={player.muted ? 'Unmute' : 'Mute'}>
		<Icon name={player.muted || player.volume === 0 ? 'muted' : 'volume'} />
	</Button>
	<input
		class="range volume"
		type="range"
		min="0"
		max="1"
		step="0.05"
		bind:value={player.volume}
		aria-label="Volume"
		style:--fill={percent(player.muted ? 0 : player.volume, 1)}
	/>

	{@render children?.()}

	<Button
		class="icon-button"
		onclick={player.toggleFullscreen}
		aria-label={player.fullscreen ? 'Exit fullscreen' : 'Fullscreen'}
	>
		<Icon name={player.fullscreen ? 'exit-fullscreen' : 'fullscreen'} />
	</Button>
</div>

<style>
	.controls {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 4px;
	}

	.time {
		margin: 0 auto 0 12px;
		color: #ddd;
		font-size: 14px;
		font-variant-numeric: tabular-nums;
	}

	.range {
		height: 4px;
		margin: 8px 0;
		background: linear-gradient(
			to right,
			#fff var(--fill),
			rgb(255 255 255 / 0.4) var(--fill) var(--loaded, var(--fill)),
			rgb(255 255 255 / 0.2) var(--loaded, var(--fill))
		);
		cursor: pointer;
		appearance: none;
	}

	.range::-webkit-slider-thumb {
		width: 14px;
		height: 14px;
		border-radius: 50%;
		background: #fff;
		appearance: none;
	}

	.range::-moz-range-thumb {
		width: 14px;
		height: 14px;
		border: none;
		border-radius: 50%;
		background: #fff;
	}

	.range:focus-visible {
		outline: 2px solid #fff;
		outline-offset: 2px;
	}

	.volume {
		width: 88px;
		margin-right: 12px;
	}

	@media (max-width: 720px) {
		.volume {
			display: none;
		}
	}
</style>
