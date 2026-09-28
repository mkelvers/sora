<script lang="ts">
	import Button from "$lib/components/ui/Button.svelte";
	import { formatClock } from "$lib/utils";
	import {
		CornersInIcon,
		CornersOutIcon,
		FastForwardIcon,
		PauseIcon,
		PlayIcon,
		RewindIcon,
		SkipBackIcon,
		SkipForwardIcon,
		SpeakerHighIcon,
		SpeakerSlashIcon,
	} from "phosphor-svelte";
	import type { Snippet } from "svelte";

	import type { Player } from "../watch.svelte";

	type Props = {
		player: Player;
		previous?: string;
		next?: string;
		children?: Snippet;
	};

	let { player, previous, next, children }: Props = $props();

	const icon =
		"inline-grid size-10 place-items-center rounded-full text-[#ddd] transition-colors duration-120 hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white focus-visible:ring-0";
	const range =
		"my-2 h-1 cursor-pointer appearance-none [--loaded-end:calc(var(--loaded,var(--played))*100%)] [--played-end:calc(var(--played)*100%)] bg-[linear-gradient(to_right,#fff_var(--played-end),rgb(255_255_255/0.4)_var(--played-end)_var(--loaded-end),rgb(255_255_255/0.2)_var(--loaded-end))] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white [&::-moz-range-thumb]:size-3.5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-none [&::-moz-range-thumb]:bg-white [&::-webkit-slider-thumb]:size-3.5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white";
</script>

<input
	class={range}
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

<div class="flex flex-wrap items-center gap-1">
	{#if previous}
		<a class={icon} href={previous} aria-label="Previous episode">
			<SkipBackIcon size="1.5rem" weight="fill" />
		</a>
	{/if}

	<Button class={icon} aria-label="Rewind 10 seconds" onclick={() => (player.time -= 10)}>
		<RewindIcon size="1.5rem" weight="fill" />
	</Button>

	<Button
		class={icon}
		aria-label={player.paused ? "Play" : "Pause"}
		onclick={() => (player.paused = !player.paused)}
	>
		{#if player.paused}
			<PlayIcon size="1.5rem" weight="fill" />
		{:else}
			<PauseIcon size="1.5rem" weight="fill" />
		{/if}
	</Button>

	<Button class={icon} aria-label="Forward 10 seconds" onclick={() => (player.time += 10)}>
		<FastForwardIcon size="1.5rem" weight="fill" />
	</Button>

	{#if next}
		<a class={icon} href={next} aria-label="Next episode">
			<SkipForwardIcon size="1.5rem" weight="fill" />
		</a>
	{/if}

	<span class="mr-auto ml-3 text-sm text-[#ddd] tabular-nums">
		{formatClock(player.time)} / {formatClock(player.duration)}
	</span>

	<Button
		class={icon}
		aria-label={player.muted ? "Unmute" : "Mute"}
		onclick={() => (player.muted = !player.muted)}
	>
		{#if player.muted || player.volume === 0}
			<SpeakerSlashIcon size="1.5rem" weight="fill" />
		{:else}
			<SpeakerHighIcon size="1.5rem" weight="fill" />
		{/if}
	</Button>

	<input
		class={[range, "mr-3 w-22"]}
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
		class={icon}
		aria-label={player.fullscreen ? "Exit fullscreen" : "Fullscreen"}
		onclick={player.toggleFullscreen}
	>
		{#if player.fullscreen}
			<CornersInIcon size="1.5rem" weight="bold" />
		{:else}
			<CornersOutIcon size="1.5rem" weight="bold" />
		{/if}
	</Button>
</div>
