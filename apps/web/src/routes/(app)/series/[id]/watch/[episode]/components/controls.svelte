<script lang="ts">
	import Button from "$lib/components/ui/button.svelte";
	import Slider from "$lib/components/ui/slider.svelte";
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
		series,
		episode,
		children,
	}: {
		player: Player;
		previous?: string;
		next?: string;
		series: string;
		episode: string;
		children?: Snippet;
	} = $props();

	let pointer = $state<{ time: number; x: number; width: number }>();

	const track = (event: PointerEvent & { currentTarget: HTMLElement }) => {
		if (!(player.duration > 0)) {
			return;
		}

		const { left, width } = event.currentTarget.getBoundingClientRect();
		const x = Math.min(Math.max(event.clientX - left, 0), width);
		pointer = {
			time: (x / width) * player.duration,
			width,
			x,
		};
	};

	const pad = (value: number) => String(value).padStart(2, "0");

	const clock = (seconds: number) => {
		const total = Math.floor(Number.isFinite(seconds) ? Math.max(0, seconds) : 0);
		const hours = Math.floor(total / 3600);

		return hours
			? `${hours}:${pad(Math.floor((total % 3600) / 60))}:${pad(total % 60)}`
			: `${Math.floor(total / 60)}:${pad(total % 60)}`;
	};
</script>

<div
	class="relative flex flex-col"
	role="presentation"
	onpointermove={track}
	onpointerleave={() => (pointer = undefined)}
>
	<Slider
		max={player.duration || 0}
		step="any"
		bind:value={player.time}
		fill={player.played}
		buffered={player.loaded}
		aria-label="Seek"
		aria-valuetext="{clock(player.time)} of {clock(player.duration)}"
		class="my-0 h-6 bg-clip-content py-2.5"
	/>

	{#if pointer}
		<p
			class="pointer-events-none absolute bottom-full z-10 mb-1 -translate-x-1/2 bg-white px-2 py-0.5 text-sm font-semibold text-black tabular-nums"
			style:left="{Math.min(Math.max(pointer.x, 28), pointer.width - 28)}px"
			aria-hidden="true"
		>
			{clock(pointer.time)}
		</p>
	{/if}
</div>

<div class="flex flex-wrap items-center gap-1" role="group" aria-label="Playback controls">
	{#if previous}
		<Button
			href={previous}
			variant="icon"
			class="pointer-fine:hidden"
			aria-label="Previous episode"
		>
			<SkipBackIcon size="1.5rem" weight="fill" />
		</Button>
	{/if}

	<Button
		variant="icon"
		class="pointer-fine:hidden"
		aria-label="Rewind 10 seconds"
		onclick={() => (player.time -= 10)}
	>
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

	<Button
		variant="icon"
		class="pointer-fine:hidden"
		aria-label="Forward 10 seconds"
		onclick={() => (player.time += 10)}
	>
		<FastForwardIcon size="1.5rem" weight="fill" />
	</Button>

	{#if next}
		<Button href={next} variant="icon" class="pointer-fine:hidden" aria-label="Next episode">
			<SkipForwardIcon size="1.5rem" weight="fill" />
		</Button>
	{/if}

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
		class="mr-2 w-22 max-sm:hidden pointer-coarse:hidden"
	/>

	<p
		class="ml-2 shrink-0 text-sm text-foreground/90 tabular-nums max-sm:order-first max-sm:ml-1 max-sm:w-full"
	>
		{clock(player.time)}
		<span aria-hidden="true">/</span>
		<span class="sr-only">of</span>
		{clock(player.duration)}
	</p>

	<h1 class="mx-4 min-w-0 flex-1 truncate text-center text-sm max-sm:sr-only">
		<strong class="font-semibold">{series}</strong>
		<span class="ml-1.5 text-foreground/70">{episode}</span>
	</h1>

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
