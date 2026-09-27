<script lang="ts">
	import type { Snippet } from 'svelte';
	import {
		ClockCounterClockwiseIcon,
		ClockClockwiseIcon,
		CornersInIcon,
		CornersOutIcon,
		PauseIcon,
		PlayIcon,
		SkipBackIcon,
		SkipForwardIcon,
		SpeakerHighIcon,
		SpeakerSlashIcon,
	} from 'phosphor-svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import { cn, formatClock } from '$lib/utils';
	import type { Player } from '../watch.svelte';

	let {
		player,
		previous,
		next,
		hidden,
		children,
	}: {
		player: Player;
		previous?: string;
		next?: string;
		hidden: boolean;
		children?: Snippet;
	} = $props();

	let preview = $state<{
		time: number;
		left: number;
	} | null>(null);

	const control =
		'grid size-11 cursor-pointer place-items-center transition-[opacity,transform] duration-150 hover:opacity-75 active:scale-90 sm:size-9';
</script>

<div
	class={cn(
		'absolute inset-x-0 bottom-0 z-20 bg-linear-to-t from-black/95 via-black/50 to-transparent px-4 pt-20 pb-[max(1rem,env(safe-area-inset-bottom))] transition-opacity duration-300 sm:px-6 sm:pb-5',
		hidden && 'pointer-events-none opacity-0'
	)}
>
	<div class="flex items-center justify-between px-1">
		<div class="flex items-center gap-3">
			{#if previous}
				<a class={control} href={previous} aria-label="Previous episode">
					<SkipBackIcon size="1.5rem" weight="fill" />
				</a>
			{/if}

			<Button class={control} aria-label={player.paused ? 'Play' : 'Pause'} onclick={() => (player.paused = !player.paused)}>
				{#if player.paused}
					<PlayIcon size="1.6rem" weight="fill" />
				{:else}
					<PauseIcon size="1.6rem" weight="fill" />
				{/if}
			</Button>

			{#if next}
				<a class={control} href={next} aria-label="Next episode">
					<SkipForwardIcon size="1.5rem" weight="fill" />
				</a>
			{/if}

			<Button class={control} aria-label="Rewind 10 seconds" onclick={() => (player.time -= 10)}>
				<ClockCounterClockwiseIcon size="1.5rem" />
			</Button>

			<Button class={control} aria-label="Forward 10 seconds" onclick={() => (player.time += 10)}>
				<ClockClockwiseIcon size="1.5rem" />
			</Button>

			<div class="group/volume relative">
				<div
					class="pointer-events-none absolute inset-x-0 bottom-full mx-auto flex h-40 w-8 items-end justify-center pb-3 opacity-0 transition-opacity group-focus-within/volume:pointer-events-auto group-focus-within/volume:opacity-100 group-hover/volume:pointer-events-auto group-hover/volume:opacity-100"
				>
					<input
						type="range"
						min="0"
						max="1"
						step="0.05"
						bind:value={player.volume}
						aria-label="Volume"
						class="volume-input h-28 w-8 cursor-pointer accent-accent"
					/>
				</div>

				<Button class={control} aria-label={player.muted ? 'Unmute' : 'Mute'} onclick={() => (player.muted = !player.muted)}>
					{#if player.muted || player.volume === 0}
						<SpeakerSlashIcon size="1.5rem" />
					{:else}
						<SpeakerHighIcon size="1.5rem" />
					{/if}
				</Button>
			</div>
		</div>

		<div class="flex items-center gap-3">
			{@render children?.()}

			<Button
				class={control}
				aria-label={player.fullscreen ? 'Exit fullscreen' : 'Fullscreen'}
				onclick={player.toggleFullscreen}
			>
				{#if player.fullscreen}
					<CornersInIcon size="1.5rem" weight="bold" />
				{:else}
					<CornersOutIcon size="1.5rem" weight="bold" />
				{/if}
			</Button>
		</div>
	</div>

	<div class="mt-2 flex items-center gap-3 px-1 text-xs font-medium sm:mt-3 sm:gap-4">
		<span class="w-18 shrink-0 pl-1 text-left whitespace-nowrap tabular-nums">{formatClock(player.time)}</span>

		<div class="group/timeline relative flex h-7 min-w-0 flex-1 items-center">
			{#if preview}
				<div
					class="pointer-events-none absolute bottom-full z-30 mb-2 min-w-max -translate-x-1/2 bg-white px-2 py-1 text-xs font-bold whitespace-nowrap text-black"
					style:left="{preview.left}px"
				>
					{formatClock(preview.time)}
				</div>
			{/if}

			<div class="relative h-1 w-full bg-white/25 transition-[height] group-hover/timeline:h-1.5" aria-hidden="true">
				<div class="absolute inset-y-0 left-0 bg-white/60" style:width="{player.loaded * 100}%"></div>
				<div class="absolute inset-y-0 left-0 bg-accent" style:width="{player.played * 100}%"></div>
			</div>

			<input
				type="range"
				min="0"
				max={player.duration || 0}
				step="any"
				bind:value={player.time}
				aria-label="Seek"
				aria-valuetext="{formatClock(player.time)} of {formatClock(player.duration)}"
				class="absolute inset-0 z-20 cursor-pointer opacity-0"
				onpointermove={(event) => {
					const bounds = event.currentTarget.getBoundingClientRect();
					const ratio = Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width));
					preview = {
						time: ratio * player.duration,
						left: Math.max(30, Math.min(bounds.width - 30, ratio * bounds.width)),
					};
				}}
				onpointerleave={() => (preview = null)}
			/>
		</div>

		<span class="w-18 shrink-0 pr-1 text-right whitespace-nowrap tabular-nums">{formatClock(player.duration)}</span>
	</div>
</div>
