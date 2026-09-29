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
</script>

<input
	class="my-2 h-1 cursor-pointer appearance-none bg-[linear-gradient(to_right,#fff_var(--played-end),rgb(255_255_255/0.4)_var(--played-end)_var(--loaded-end),rgb(255_255_255/0.2)_var(--loaded-end))] [--loaded-end:calc(var(--loaded,var(--played))*100%)] [--played-end:calc(var(--played)*100%)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white [&::-moz-range-thumb]:size-3.5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-none [&::-moz-range-thumb]:bg-white [&::-webkit-slider-thumb]:size-3.5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white"
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

<div class="flex flex-wrap items-center gap-1" role="group" aria-label="Playback controls">
	{#if previous}
		<Button href={previous} variant="icon" class="sm:size-10" aria-label="Previous episode">
			<SkipBackIcon size="1.5rem" weight="fill" />
		</Button>
	{/if}

	<Button
		variant="icon"
		class="sm:size-10"
		aria-label="Rewind 10 seconds"
		onclick={() => (player.time -= 10)}
	>
		<RewindIcon size="1.5rem" weight="fill" />
	</Button>

	<Button
		variant="icon"
		class="sm:size-10"
		aria-label={player.paused ? "Play" : "Pause"}
		onclick={() => (player.paused = !player.paused)}
	>
		{#if player.paused}
			<PlayIcon size="1.5rem" weight="fill" />
		{:else}
			<PauseIcon size="1.5rem" weight="fill" />
		{/if}
	</Button>

	<Button
		variant="icon"
		class="sm:size-10"
		aria-label="Forward 10 seconds"
		onclick={() => (player.time += 10)}
	>
		<FastForwardIcon size="1.5rem" weight="fill" />
	</Button>

	{#if next}
		<Button href={next} variant="icon" class="sm:size-10" aria-label="Next episode">
			<SkipForwardIcon size="1.5rem" weight="fill" />
		</Button>
	{/if}

	<p
		class="mr-auto ml-3 text-sm text-[#ddd] tabular-nums max-sm:order-first max-sm:ml-1 max-sm:w-full"
		aria-label="{formatClock(player.time)} of {formatClock(player.duration)}"
	>
		{formatClock(player.time)} / {formatClock(player.duration)}
	</p>

	<Button
		variant="icon"
		class="max-sm:ml-auto sm:size-10"
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
		class="my-2 mr-3 h-1 w-22 cursor-pointer appearance-none bg-[linear-gradient(to_right,#fff_var(--played-end),rgb(255_255_255/0.4)_var(--played-end)_var(--loaded-end),rgb(255_255_255/0.2)_var(--loaded-end))] [--loaded-end:calc(var(--loaded,var(--played))*100%)] [--played-end:calc(var(--played)*100%)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white max-sm:hidden pointer-coarse:hidden [&::-moz-range-thumb]:size-3.5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-none [&::-moz-range-thumb]:bg-white [&::-webkit-slider-thumb]:size-3.5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white"
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
		variant="icon"
		class="sm:size-10"
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
