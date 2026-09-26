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
	style:--played={player.played}
	style:--loaded={player.loaded}
/>

<div class="controls">
	{#if previous}
		<a class="icon-button" href={previous} aria-label="Previous episode">
			<Icon name="previous" />
		</a>
	{/if}

	<Button
		class="icon-button"
		aria-label="Rewind 10 seconds"
		onclick={() => player.seek(-10)}
	>
		<Icon name="rewind" />
	</Button>

	<Button
		class="icon-button"
		aria-label={player.paused ? 'Play' : 'Pause'}
		onclick={player.toggle}
	>
		<Icon name={player.paused ? 'play' : 'pause'} />
	</Button>

	<Button
		class="icon-button"
		aria-label="Forward 10 seconds"
		onclick={() => player.seek(10)}
	>
		<Icon name="forward" />
	</Button>

	{#if next}
		<a class="icon-button" href={next} aria-label="Next episode">
			<Icon name="next" />
		</a>
	{/if}

	<span class="time">
		{formatClock(player.time)} / {formatClock(player.duration)}
	</span>

	<Button
		class="icon-button"
		aria-label={player.muted ? 'Unmute' : 'Mute'}
		onclick={() => (player.muted = !player.muted)}
	>
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
		style:--played={player.muted ? 0 : player.volume}
	/>

	{@render children?.()}

	<Button
		class="icon-button"
		aria-label={player.fullscreen ? 'Exit fullscreen' : 'Fullscreen'}
		onclick={player.toggleFullscreen}
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
		--played-end: calc(var(--played) * 100%);
		--loaded-end: calc(var(--loaded, var(--played)) * 100%);
		height: 4px;
		margin: 8px 0;
		background: linear-gradient(
			to right,
			#fff var(--played-end),
			rgb(255 255 255 / 0.4) var(--played-end) var(--loaded-end),
			rgb(255 255 255 / 0.2) var(--loaded-end)
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
