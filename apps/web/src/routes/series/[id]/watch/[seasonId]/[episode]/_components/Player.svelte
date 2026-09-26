<script lang="ts">
	import { untrack } from 'svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Icon from '$lib/components/ui/Icon.svelte';
	import Settings, { type Setting } from './Settings.svelte';
	import { getPlayback } from '../watch.remote';

	type Props = {
		seriesId: string;
		seasonId: string;
		episode: number;
		episodeCount: number;
		series: string;
		season: string;
		title: string;
	};

	let { seriesId, seasonId, episode, episodeCount, series, season, title }: Props = $props();

	const AUDIO = { dub: 'Dub', sub: 'Sub', raw: 'Raw' };
	const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];

	// The query itself is held, not just its value: its cache entry lives only
	// as long as something references it
	const query = $derived(getPlayback({ seriesId, seasonId, episode }));
	const playback = $derived(query.current);

	let audio = $derived(playback?.media[0]?.audio);
	const media = $derived(playback?.media.find((media) => media.audio === audio));
	const subtitles = $derived(media?.subtitles.filter((track) => track.format === 'vtt') ?? []);
	let subtitle = $derived(media?.hardsub === false && media.audio === 'sub' ? (subtitles[0]?.url ?? 'off') : 'off');

	let root = $state<HTMLElement>();
	let paused = $state(true);
	let time = $state(0);
	let duration = $state(0);
	let ranges = $state<{ start: number; end: number }[]>([]);
	let volume = $state(1);
	let muted = $state(false);
	let speed = $state(1);
	let readyState = $state(0);
	let failure = $state<string>();
	let fullscreen = $state(false);
	let idle = $state(false);
	let cues = $state<VTTCue[]>([]);
	let timer: ReturnType<typeof setTimeout>;
	let dismissing = false;

	const problem = $derived(playback?.problem ?? failure);
	const loaded = $derived(ranges.find((range) => range.start <= time && time <= range.end)?.end ?? 0);
	const segment = $derived(media?.skip_segments.find((segment) => time >= segment.start && time < segment.end));

	$effect(() => {
		const source = media?.sources[0];
		const video = root?.querySelector('video');
		if (!source || !video) {
			return;
		}

		const start = untrack(() => time);
		let hls: import('hls.js').default | undefined;
		let cancelled = false;
		failure = undefined;

		import('hls.js').then(({ default: Hls }) => {
			if (cancelled) {
				return;
			}

			if (source.format === 'hls' && Hls.isSupported()) {
				hls = new Hls({ startPosition: start });
				hls.on(Hls.Events.ERROR, (_, data) => {
					if (data.fatal) {
						failure =
							data.details === Hls.ErrorDetails.MANIFEST_PARSING_ERROR
								? 'This stream is not a valid HLS playlist.'
								: 'The stream stopped loading.';
					}
				});
				hls.loadSource(source.url);
				hls.attachMedia(video);
			} else if (source.format === 'mp4' || video.canPlayType('application/vnd.apple.mpegurl')) {
				video.src = source.url;
				video.currentTime = start;
			} else {
				failure = 'This browser cannot play HLS streams.';
				return;
			}

			video.play().catch(() => {});
		});

		return () => {
			cancelled = true;
			hls?.destroy();
			video.removeAttribute('src');
			video.load();
		};
	});

	function wake() {
		idle = false;
		clearTimeout(timer);
		timer = setTimeout(() => (idle = true), 3000);
	}

	function toggleFullscreen() {
		if (document.fullscreenElement) {
			document.exitFullscreen();
		} else {
			root?.requestFullscreen();
		}
	}

	function retry() {
		failure = undefined;
		getPlayback({ seriesId, seasonId, episode }).refresh();
	}

	function onkeydown(event: KeyboardEvent) {
		const target = event.target as HTMLElement;
		if (event.metaKey || event.ctrlKey || target.closest('input, [popover]') || (event.key === ' ' && target.closest('button, a'))) {
			return;
		}

		const action = {
			' ': () => (paused = !paused),
			k: () => (paused = !paused),
			ArrowLeft: () => (time -= 10),
			ArrowRight: () => (time += 10),
			m: () => (muted = !muted),
			f: toggleFullscreen
		}[event.key];

		if (action) {
			event.preventDefault();
			action();
			wake();
		}
	}

	function clock(seconds: number) {
		const minutes = Math.floor(seconds / 60);
		const rest = String(Math.floor(seconds % 60)).padStart(2, '0');
		return minutes >= 60 ? `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}:${rest}` : `${minutes}:${rest}`;
	}

	const settings: Setting[] = $derived([
		...(playback && playback.media.length > 1
			? [
					{
						label: 'Audio',
						value: audio ?? '',
						options: playback.media.map((media) => ({ value: media.audio, label: AUDIO[media.audio] })),
						select: (value: string) => (audio = value as typeof audio)
					}
				]
			: []),
		...(subtitles.length > 0
			? [
					{
						label: 'Subtitles',
						value: subtitle,
						options: [
							{ value: 'off', label: 'Off' },
							...subtitles.map((track) => ({ value: track.url, label: track.label }))
						],
						select: (value: string) => (subtitle = value)
					}
				]
			: []),
		{
			label: 'Speed',
			value: String(speed),
			options: SPEEDS.map((rate) => ({ value: String(rate), label: rate === 1 ? 'Normal' : `${rate}×` })),
			select: (value: string) => (speed = Number(value))
		}
	]);

	const percent = (value: number, max: number) => `${max > 0 ? (value / max) * 100 : 0}%`;
</script>

<svelte:head>
	<title>{title} · {series}</title>
</svelte:head>

<svelte:window {onkeydown} onpointermove={wake} />
<svelte:document onfullscreenchange={() => (fullscreen = document.fullscreenElement === root)} />

<div class="player" class:idle={idle && !paused} bind:this={root}>
	<video
		bind:paused
		bind:currentTime={time}
		bind:duration
		bind:buffered={ranges}
		bind:volume
		bind:muted
		bind:playbackRate={speed}
		bind:readyState
		crossorigin="anonymous"
		playsinline
		onpointerdown={() => (dismissing = document.querySelector(':popover-open') !== null)}
		onclick={() => dismissing || (paused = !paused)}
		ondblclick={toggleFullscreen}
		onerror={() => (failure ??= 'The video could not be played.')}
	>
		{#each subtitles as track (track.url)}
			<track
				kind="captions"
				src={track.url}
				srclang={track.language}
				label={track.label}
				{@attach (element) => {
					const text = element.track;
					if (track.url !== subtitle) {
						text.mode = 'disabled';
						return;
					}

					text.mode = 'hidden';
					text.oncuechange = () => (cues = [...(text.activeCues ?? [])] as VTTCue[]);
					return () => {
						text.oncuechange = null;
						cues = [];
					};
				}}
			/>
		{/each}
	</video>

	{#if problem}
		<div class="notice" role="alert">
			<p>{problem}</p>
			<Button class="pill" onclick={retry}>Try again</Button>
		</div>
	{:else if !playback || (readyState < 3 && !paused)}
		<div class="spinner" role="status" aria-label="Loading"></div>
	{/if}

	<div class="lower">
		{#if segment}
			<Button class="pill skip" onclick={() => (time = segment.end)}>
				{segment.kind === 'opening' ? 'Skip intro' : 'Skip credits'}
			</Button>
		{/if}

		<div class="captions">
			{#each cues as cue (cue)}
				<p {@attach (element) => element.replaceChildren(cue.getCueAsHTML())}></p>
			{/each}
		</div>
	</div>

	<header class="overlay">
		<a class="icon-button" href="/series/{seriesId}" aria-label="Back to {series}">
			<Icon name="back" />
		</a>
		<div>
			<h1>{episode}. {title}</h1>
			<p>{series} · {season}</p>
		</div>
	</header>

	<footer class="overlay">
		<input
			class="range"
			type="range"
			min="0"
			max={duration || 0}
			step="any"
			bind:value={time}
			aria-label="Seek"
			aria-valuetext="{clock(time)} of {clock(duration)}"
			style:--fill={percent(time, duration)}
			style:--loaded={percent(loaded, duration)}
		/>

		<div class="controls">
			{#if episode > 1}
				<a class="icon-button" href="/series/{seriesId}/watch/{seasonId}/{episode - 1}" aria-label="Previous episode">
					<Icon name="previous" />
				</a>
			{/if}
			<Button class="icon-button" onclick={() => (time -= 10)} aria-label="Rewind 10 seconds">
				<Icon name="rewind" />
			</Button>
			<Button class="icon-button" onclick={() => (paused = !paused)} aria-label={paused ? 'Play' : 'Pause'}>
				<Icon name={paused ? 'play' : 'pause'} />
			</Button>
			<Button class="icon-button" onclick={() => (time += 10)} aria-label="Forward 10 seconds">
				<Icon name="forward" />
			</Button>
			{#if episode < episodeCount}
				<a class="icon-button" href="/series/{seriesId}/watch/{seasonId}/{episode + 1}" aria-label="Next episode">
					<Icon name="next" />
				</a>
			{/if}

			<span class="time">{clock(time)} / {clock(duration)}</span>

			<Button class="icon-button" onclick={() => (muted = !muted)} aria-label={muted ? 'Unmute' : 'Mute'}>
				<Icon name={muted || volume === 0 ? 'muted' : 'volume'} />
			</Button>
			<input
				class="range volume"
				type="range"
				min="0"
				max="1"
				step="0.05"
				bind:value={volume}
				aria-label="Volume"
				style:--fill={percent(muted ? 0 : volume, 1)}
			/>

			<Settings {settings} />

			<Button class="icon-button" onclick={toggleFullscreen} aria-label={fullscreen ? 'Exit fullscreen' : 'Fullscreen'}>
				<Icon name={fullscreen ? 'exit-fullscreen' : 'fullscreen'} />
			</Button>
		</div>
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

	.player > * {
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

	.captions {
		color: #fff;
		font-size: clamp(18px, 2.6vw, 40px);
		font-weight: 600;
		line-height: 1.25;
		text-align: center;
		text-shadow: 0 2px 6px rgb(0 0 0 / 0.6);
		white-space: pre-line;
		pointer-events: none;
		-webkit-text-stroke: 0.14em #000;
		paint-order: stroke fill;
	}

	.captions p {
		margin: 0;
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

	.volume {
		width: 88px;
		margin-right: 12px;
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

	.icon-button:focus-visible,
	.range:focus-visible {
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

	.spinner {
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

		.volume {
			display: none;
		}
	}
</style>
