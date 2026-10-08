<script lang="ts">
	import Button from "$lib/components/ui/Button.svelte";
	import Slider from "$lib/components/ui/Slider.svelte";
	import type { Player } from "$routes/(app)/series/[id]/watch/[episode]/watch.svelte";
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

	let {
		player,
		previous,
		next,
		children,
	}: {
		player: Player;
		previous?: string;
		next?: string;
		children?: Snippet;
	} = $props();

	function clock(seconds: number) {
		const total = Math.floor(Number.isFinite(seconds) ? Math.max(0, seconds) : 0);
		const hours = Math.floor(total / 3600);
		const pad = (value: number) => String(value).padStart(2, "0");

		return hours
			? `${hours}:${pad(Math.floor((total % 3600) / 60))}:${pad(total % 60)}`
			: `${Math.floor(total / 60)}:${pad(total % 60)}`;
	}
</script>

<Slider
	max={player.duration || 0}
	step="any"
	bind:value={player.time}
	fill={player.played}
	buffered={player.loaded}
	aria-label="Seek"
	aria-valuetext="{clock(player.time)} of {clock(player.duration)}"
/>

<div class="flex flex-wrap items-center gap-1" role="group" aria-label="Playback controls">
	{#if previous}
		<Button href={previous} variant="icon" aria-label="Previous episode">
			<SkipBackIcon size="1.5rem" weight="fill" />
		</Button>
	{/if}

	<Button variant="icon" aria-label="Rewind 10 seconds" onclick={() => (player.time -= 10)}>
		<RewindIcon size="1.5rem" weight="fill" />
	</Button>

	<Button
		variant="icon"
		aria-label={player.paused ? "Play" : "Pause"}
		onclick={() => (player.paused = !player.paused)}
	>
		{#if player.paused}
			<PlayIcon size="1.5rem" weight="fill" />
		{:else}
			<PauseIcon size="1.5rem" weight="fill" />
		{/if}
	</Button>

	<Button variant="icon" aria-label="Forward 10 seconds" onclick={() => (player.time += 10)}>
		<FastForwardIcon size="1.5rem" weight="fill" />
	</Button>

	{#if next}
		<Button href={next} variant="icon" aria-label="Next episode">
			<SkipForwardIcon size="1.5rem" weight="fill" />
		</Button>
	{/if}

	<p
		class="mr-auto ml-3 text-sm text-foreground/90 tabular-nums max-sm:order-first max-sm:ml-1 max-sm:w-full"
	>
		{clock(player.time)}
		<span aria-hidden="true">/</span>
		<span class="sr-only">of</span>
		{clock(player.duration)}
	</p>

	<Button
		variant="icon"
		class="max-sm:ml-auto"
		aria-label={player.muted ? "Unmute" : "Mute"}
		onclick={() => (player.muted = !player.muted)}
	>
		{#if player.muted || player.volume === 0}
			<SpeakerSlashIcon size="1.5rem" weight="fill" />
		{:else}
			<SpeakerHighIcon size="1.5rem" weight="fill" />
		{/if}
	</Button>

	<Slider
		max={1}
		step="0.05"
		bind:value={player.volume}
		fill={player.muted ? 0 : player.volume}
		aria-label="Volume"
		class="mr-3 w-22 max-sm:hidden pointer-coarse:hidden"
	/>

	{@render children?.()}

	<Button
		variant="icon"
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
