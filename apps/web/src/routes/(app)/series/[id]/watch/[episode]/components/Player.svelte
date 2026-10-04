<script lang="ts">
	import { goto } from "$app/navigation";
	import Button from "$lib/components/ui/Button.svelte";
	import { Player } from "$routes/(app)/series/[id]/watch/[episode]/watch.svelte";
	import type { PlaybackMedia, PlaybackPreferences, PlaybackPreferencesUpdate } from "@sora/sdk";
	import { ArrowLeftIcon } from "phosphor-svelte";
	import { onDestroy, untrack } from "svelte";

	import Controls from "./Controls.svelte";
	import Settings from "./Settings.svelte";

	type Props = {
		id: string;
		media: PlaybackMedia[] | undefined;
		back: string;
		previous?: string;
		next?: string;
		title: string;
		series: string;
		preferences: PlaybackPreferences;
		start: number;
		onprogress: (position: number, duration: number, finished: boolean, leaving: boolean) => void;
		onpreferences: (changes: PlaybackPreferencesUpdate) => void;
		onnearend: () => void;
	};

	let {
		id,
		media: versions,
		back,
		previous,
		next,
		title,
		series,
		preferences,
		start,
		onprogress,
		onpreferences,
		onnearend,
	}: Props = $props();

	const player = new Player(untrack(() => start));

	let nearing = false;
	let skipped = new Set<number>();
	let current = untrack(() => id);

	$effect.pre(() => {
		if (id === current) {
			return;
		}

		current = id;
		nearing = false;
		skipped = new Set();
		player.load(start);
	});

	$effect(() => {
		if (nearing || player.duration <= 0 || player.duration - player.time > 60) {
			return;
		}

		nearing = true;
		untrack(onnearend);
	});

	function report(ended = false, leaving = false) {
		if (!(player.duration >= 1) || player.time <= 0) {
			return;
		}

		const credits = media?.skip_segments.find((candidate) => candidate.kind === "ending");
		onprogress(
			player.time,
			player.duration,
			ended || (!!credits && player.time >= credits.start),
			leaving,
		);
	}

	$effect(() => {
		const timer = setInterval(() => {
			if (!player.paused && !player.buffering) {
				report();
			}
		}, 10_000);

		return () => clearInterval(timer);
	});

	onDestroy(() => report(false, true));

	const audio = $derived(
		versions?.find((version) => version.audio === preferences.audio)?.audio ?? versions?.[0]?.audio,
	);
	const media = $derived(versions?.find((version) => version.audio === audio));
	const subtitle = $derived.by(() => {
		if (!media || media.audio === "raw") {
			return undefined;
		}

		const choice = preferences.subtitles[media.audio];
		if (choice === null) {
			return undefined;
		}

		const tracks = media.subtitles;
		const picked =
			choice &&
			(tracks.find((track) => track.language === choice.language && track.kind === choice.kind) ??
				tracks.find((track) => track.language === choice.language));

		return (picked ?? tracks.find((track) => track.default))?.url;
	});

	function pickSubtitle(url: string | undefined) {
		if (!media || media.audio === "raw") {
			return;
		}

		const track = media.subtitles.find((track) => track.url === url);
		onpreferences({
			subtitles: {
				[media.audio]: track
					? {
							language: track.language,
							kind: track.kind,
						}
					: null,
			},
		});
	}

	const loading = $derived(!versions || (media !== undefined && player.buffering));

	const segment = $derived(
		media?.skip_segments.find((segment) => {
			return player.time >= segment.start && player.time < segment.end;
		}),
	);

	$effect(() => {
		if (!preferences.auto_skip || !segment || skipped.has(segment.start)) {
			return;
		}

		skipped.add(segment.start);
		player.time = segment.end;
	});

	$effect(() => player.remember());
</script>

<svelte:window onkeydown={player.onkeydown} onpointermove={player.wake} />
<svelte:document
	onvisibilitychange={() => {
		if (document.hidden) {
			report();
		}
	}}
/>

<section
	aria-label="Video player"
	class={[
		"grid h-dvh grid-cols-1 grid-rows-1 overflow-hidden bg-black text-white *:[grid-area:1/1]",
		player.idle && !player.paused && "idle cursor-none",
		loading &&
			"after:pointer-events-none after:size-12 after:animate-spin after:place-self-center after:rounded-full after:border-3 after:border-white/20 after:border-t-white after:[grid-area:1/1]",
	]}
	aria-busy={loading}
	bind:this={player.root}
>
	<video
		bind:currentTime={player.time}
		bind:duration={player.duration}
		bind:buffered={player.buffered}
		bind:volume={player.volume}
		bind:muted={player.muted}
		bind:playbackRate={player.speed}
		bind:readyState={player.readyState}
		class="size-full object-cover"
		crossorigin="anonymous"
		autoplay
		playsinline
		onpointerdown={player.onpointerdown}
		onclick={player.onclick}
		ondblclick={player.toggleFullscreen}
		onplay={() => (player.paused = false)}
		onpause={() => {
			player.paused = true;
			report();
		}}
		onended={() => {
			report(true);
			goto(next ?? back, {
				replaceState: true,
				noScroll: true,
				keepFocus: !!next,
			});
		}}
		{@attach player.stream(media?.sources[0])}
		{@attach player.playback}
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

	<div
		class="pointer-events-none z-1 mx-4 mb-(--cue-lift) flex flex-col items-center gap-4 self-end transition-[margin] duration-200 [--cue-lift:7rem] in-[.idle:not(:has(:popover-open))]:mb-[6vh] sm:[--cue-lift:5.25rem]"
	>
		{#if segment}
			<Button
				variant="light"
				class="pointer-events-auto self-end shadow-md"
				onclick={() => (player.time = segment.end)}
			>
				{#if segment.kind === "opening"}
					Skip intro
				{:else}
					Skip credits
				{/if}
			</Button>
		{/if}

		<div
			aria-hidden="true"
			class="text-center text-[clamp(18px,2.6vw,40px)] leading-tight font-semibold whitespace-pre-line [-webkit-text-stroke:0.14em_#000] [paint-order:stroke_fill] text-shadow-lg"
		>
			{#each player.cues as cue (cue)}
				<p {@attach (element) => element.replaceChildren(cue.getCueAsHTML())}></p>
			{/each}
		</div>
	</div>

	<header
		class="flex items-center gap-3 self-start bg-[linear-gradient(rgb(0_0_0/0.85),rgb(0_0_0/0.4)_60%,transparent)] px-4 pt-4 pb-12 transition-opacity duration-200 text-shadow-md in-[.idle:not(:has(:popover-open))]:pointer-events-none in-[.idle:not(:has(:popover-open))]:opacity-0"
	>
		<Button href={back} variant="icon" size="lg" aria-label="Back to {series}">
			<ArrowLeftIcon size="1.5rem" weight="bold" />
		</Button>
		<div class="min-w-0">
			<h1 class="text-lg font-normal sm:text-xl">{title}</h1>
			<p class="mt-0.5 text-sm text-foreground/90">{series}</p>
		</div>
	</header>

	<footer
		class="flex flex-col gap-3 self-end bg-linear-to-b from-transparent to-black/80 px-4 pt-12 pb-4 transition-opacity duration-200 in-[.idle:not(:has(:popover-open))]:pointer-events-none in-[.idle:not(:has(:popover-open))]:opacity-0"
	>
		<Controls {player} {previous} {next}>
			<Settings
				media={versions ?? []}
				subtitles={media?.subtitles ?? []}
				bind:speed={player.speed}
				bind:subtitle={() => subtitle, pickSubtitle}
				bind:audio={
					() => audio,
					(value) =>
						onpreferences({
							audio: value,
						})
				}
				bind:autoskip={
					() => preferences.auto_skip,
					(value) =>
						onpreferences({
							auto_skip: value,
						})
				}
			/>
		</Controls>
	</footer>
</section>
