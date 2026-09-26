<script lang="ts">
	import type { PlaybackMedia } from '@sora/sdk';
	import Button from '$lib/components/ui/Button.svelte';
	import Icon from '$lib/components/ui/Icon.svelte';
	import Captions from './Captions.svelte';
	import Controls from './Controls.svelte';
	import Settings from './Settings.svelte';
	import { Player } from '../watch.svelte';

	type Props = {
		media: PlaybackMedia[] | undefined;
		problem: string | null | undefined;
		onretry: () => void;
		back: string;
		previous?: string;
		next?: string;
		title: string;
		series: string;
		season: string;
	};

	let { media: versions, problem, onretry, back, previous, next, title, series, season }: Props = $props();

	const player = new Player();

	let audio = $derived(versions?.[0]?.audio);
	const media = $derived(versions?.find((version) => version.audio === audio));
	let subtitle = $derived(media?.subtitles.find((track) => track.default)?.url);

	const failure = $derived(problem ?? player.failure);
	const loading = $derived(!failure && (!versions || player.buffering));
	const segment = $derived(media?.skip_segments.find(({
		start, end
	}) => player.time >= start && player.time < end));
	
</script>

<svelte:window onkeydown={player.onkeydown} onpointermove={player.wake} />
<svelte:document onfullscreenchange={player.onfullscreenchange} />

<div class="player" class:idle={player.idle && !player.paused} class:loading aria-busy={loading} bind:this={player.root}>
	<video
		bind:paused={player.paused}
		bind:currentTime={player.time}
		bind:duration={player.duration}
		bind:buffered={player.buffered}
		bind:volume={player.volume}
		bind:muted={player.muted}
		bind:playbackRate={player.speed}
		bind:readyState={player.readyState}
		crossorigin="anonymous"
		playsinline
		onpointerdown={player.onpointerdown}
		onclick={player.onclick}
		ondblclick={player.toggleFullscreen}
		onerror={() => (player.failure ??= 'The video could not be played.')}
		{@attach player.stream(media?.sources[0])}
	>
		{#each media?.subtitles ?? [] as track (track.url)}
			<track
				kind="captions"
				src={track.url}
				srclang={track.language}
				label={track.label}
				{@attach player.caption(track.url === subtitle)}
			/>
		{/each}
	</video>

	{#if failure}
		<div class="notice" role="alert">
			<p>{failure}</p>
			<Button
				class="pill"
				onclick={() => {
					player.failure = undefined;
					onretry();
				}}
			>
				Try again
			</Button>
		</div>
	{/if}

	<div class="lower">
		{#if segment}
			<Button class="pill skip" onclick={() => (player.time = segment.end)}>
				{segment.kind === 'opening' ? 'Skip intro' : 'Skip credits'}
			</Button>
		{/if}

		<Captions cues={player.cues} />
	</div>

	<header class="overlay">
		<a class="icon-button" href={back} aria-label="Back to {series}">
			<Icon name="back" />
		</a>
		<div>
			<h1>{title}</h1>
			<p>{series} · {season}</p>
		</div>
	</header>

	<footer class="overlay">
		<Controls {player} {previous} {next}>
			<Settings media={versions ?? []} bind:audio subtitles={media?.subtitles ?? []} bind:subtitle bind:speed={player.speed} />
		</Controls>
	</footer>
</div>

<style>
	.player {
		--side: clamp(16px, 3.3vw, 64px);
		display: grid;
		grid-template: minmax(0, 1fr) / minmax(0, 1fr);
		height: 100dvh;
		overflow: hidden;
		background: #000;
		color: #fff;
	}

	.player > *,
	.player::after {
		grid-area: 1 / 1;
	}

	.player.idle {
		cursor: none;
	}

	video {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.lower {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 16px;
		align-self: end;
		z-index: 1;
		margin: 0 var(--side) 150px;
		pointer-events: none;
		transition: margin 200ms;
	}

	.idle:not(:has(:popover-open)) .lower {
		margin-bottom: 6vh;
	}

	.overlay {
		display: flex;
		gap: 12px;
		padding: 16px var(--side);
		transition: opacity 200ms;
	}

	.idle:not(:has(:popover-open)) .overlay {
		opacity: 0;
		pointer-events: none;
	}

	header {
		align-self: start;
		align-items: center;
		background: linear-gradient(rgb(0 0 0 / 0.7), transparent);
	}

	h1 {
		margin: 0;
		font-size: 20px;
		font-weight: 400;
	}

	header p {
		margin: 2px 0 0;
		color: #bbb;
		font-size: 14px;
	}

	footer {
		align-self: end;
		flex-direction: column;
		padding-top: 48px;
		background: linear-gradient(transparent, rgb(0 0 0 / 0.8));
	}

	.player :global(.icon-button) {
		display: inline-grid;
		place-items: center;
		width: 40px;
		height: 40px;
		border-radius: 50%;
		color: #ddd;
		transition: background 120ms;
	}

	.player :global(.icon-button:hover) {
		background: rgb(255 255 255 / 0.1);
		color: #fff;
	}

	.player :global(.icon-button:focus-visible) {
		outline: 2px solid #fff;
		outline-offset: 2px;
	}

	.notice {
		display: grid;
		place-self: center;
		justify-items: center;
		gap: 16px;
		padding: 0 16px;
		text-align: center;
	}

	.notice p {
		margin: 0;
		color: #e6e6e6;
	}

	.loading::after {
		content: '';
		place-self: center;
		width: 48px;
		height: 48px;
		border: 3px solid rgb(255 255 255 / 0.2);
		border-top-color: #fff;
		border-radius: 50%;
		animation: spin 800ms linear infinite;
		pointer-events: none;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	.player :global(.pill) {
		padding: 10px 18px;
		background: rgb(255 255 255 / 0.9);
		color: #101010;
		font-size: inherit;
		font-weight: 500;
	}

	.player :global(.pill:hover) {
		background: #fff;
	}

	.player :global(.skip) {
		align-self: end;
		pointer-events: auto;
	}

	@media (max-width: 720px) {
		h1 {
			font-size: 16px;
		}
	}
</style>
