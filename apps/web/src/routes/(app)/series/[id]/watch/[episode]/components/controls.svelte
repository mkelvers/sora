<script lang="ts">
	import Button from "$lib/components/ui/button.svelte";
	import Slider from "$lib/components/ui/slider.svelte";
	import { previewsOf } from "$routes/(app)/series/[id]/watch/[episode]/watch.svelte";
	import type { Player, Preview } from "$routes/(app)/series/[id]/watch/[episode]/watch.svelte";
	import { attempt } from "@sora/shared";
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
		thumbnails,
		children,
	}: {
		player: Player;
		previous?: string;
		next?: string;
		thumbnails?: string | null;
		children?: Snippet;
	} = $props();

	const previewWidth = 256;
	const maximumPreloads = 10;

	let previews = $state<Preview[]>([]);
	let requested: string | undefined;
	let pointer = $state<{ time: number; x: number; width: number }>();
	const preview = $derived(
		pointer
			? previews.find(
					(candidate) => pointer && pointer.time >= candidate.start && pointer.time < candidate.end,
				)
			: undefined,
	);

	const load = async (url: string) => {
		if (url === requested) {
			return;
		}

		requested = url;
		previews = [];
		const response = await attempt(fetch(url));
		const text = response.data?.ok ? await attempt(response.data.text()) : undefined;
		if (!text?.data) {
			requested = undefined;
			return;
		}
		if (requested !== url) {
			return;
		}

		previews = previewsOf(text.data, url);
		const images = new Set(previews.map((candidate) => candidate.image));
		if (images.size <= maximumPreloads) {
			for (const image of images) {
				new Image().src = image;
			}
		}
	};

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
	onpointerenter={() => thumbnails && load(thumbnails)}
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
	/>

	{#if pointer && preview}
		{@const frame = preview.frame}
		{@const width = Math.min(previewWidth, pointer.width)}
		{@const scale = frame ? width / frame.width : 1}
		<div
			class="pointer-events-none absolute bottom-full z-10 mb-1 bg-black shadow-lg shadow-black/50"
			style:left="{Math.min(Math.max(pointer.x - width / 2, 0), pointer.width - width)}px"
			style:width="{width}px"
			aria-hidden="true"
		>
			{#if frame}
				<div class="relative overflow-hidden" style:height="{frame.height * scale}px">
					<img
						src={preview.image}
						alt=""
						class="absolute top-0 left-0 max-w-none origin-top-left"
						style:transform="translate({-frame.x * scale}px, {-frame.y * scale}px) scale({scale})"
					/>
				</div>
			{:else}
				<div class="aspect-video overflow-hidden">
					<img src={preview.image} alt="" class="size-full object-cover" />
				</div>
			{/if}
			<p class="py-1 text-center text-xs tabular-nums">{clock(pointer.time)}</p>
		</div>
	{/if}
</div>

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
