<script lang="ts">
	import { goto } from "$app/navigation";
	import StatusBanner from "$lib/components/StatusBanner.svelte";
	import Button from "$lib/components/ui/Button.svelte";
	import {
		getEpisode,
		getPlayback,
		getPlaybackPreferences,
		getProgress,
		savePlaybackPreferences,
		saveProgress,
	} from "$routes/(app)/series/[id]/watch/[episode]/watch.remote";
	import { Player } from "$routes/(app)/series/[id]/watch/[episode]/watch.svelte";
	import {
		choosePlayback,
		type Episode,
		type PlaybackPreferences,
		type PlaybackPreferencesUpdate,
		type Progress,
		type Series,
	} from "@sora/sdk";
	import { attempt } from "@sora/shared";
	import { ArrowLeftIcon, CircleNotchIcon } from "phosphor-svelte";
	import { onDestroy, untrack } from "svelte";

	import Controls from "./Controls.svelte";
	import Settings from "./Settings.svelte";

	let {
		series,
		episode,
		playback,
		preferences,
		progress,
	}: {
		series: Series;
		episode: Episode;
		playback?: Awaited<ReturnType<typeof getPlayback>>;
		preferences: PlaybackPreferences;
		progress?: Progress | null;
	} = $props();

	const cueTags = new Set(["b", "i", "u", "ruby", "rt"]);
	const key = $derived(`${series.id}/${episode.number}`);
	const title = $derived(episode.title ?? `Episode ${episode.number}`);
	const back = $derived(`/series/${series.id}`);
	const previous = $derived(
		playback?.previous ? `/series/${series.id}/watch/${playback.previous}` : undefined,
	);
	const next = $derived(playback?.next ? `/series/${series.id}/watch/${playback.next}` : undefined);

	const start = $derived(progress && !progress.finished ? progress.position_seconds : 0);

	const player = new Player(untrack(() => start));

	let failure = $state("");
	let nearing = $state(false);
	let skipped = new Set<number>();
	let current = untrack(() => key);

	$effect.pre(() => {
		if (key === current) {
			return;
		}

		current = key;
		nearing = false;
		skipped = new Set();
		player.load(start);
	});

	$effect(() => {
		if (player.duration > 0 && player.duration - player.time <= 60) {
			nearing = true;
		}
	});

	const upcoming = $derived(
		nearing && playback?.next
			? {
					seriesId: series.id,
					episode: String(playback.next),
				}
			: undefined,
	);

	$effect(() => {
		if (upcoming) {
			void [getEpisode(upcoming), getPlayback(upcoming), getProgress(upcoming)].map(
				(query) => query.current,
			);
		}
	});

	const chosen = $derived(choosePlayback(playback?.media ?? [], preferences));
	const selected = $derived(chosen.media);
	const subtitle = $derived(chosen.subtitle?.url);
	const loading = $derived(!playback || (selected !== undefined && player.buffering));

	const segment = $derived(
		selected?.skip_segments.find(
			(segment) => player.time >= segment.start && player.time < segment.end,
		),
	);

	async function report(ended = false, leaving = false) {
		if (!(player.duration >= 1) || player.time <= 0) {
			return;
		}

		const credits = selected?.skip_segments.find((candidate) => candidate.kind === "ending");
		const { error } = await attempt(
			saveProgress({
				seriesId: series.id,
				episode: episode.number,
				position_seconds: Math.floor(player.time),
				duration_seconds: Math.floor(player.duration),
				finished: ended || (!!credits && player.time >= credits.start),
				leaving,
			}),
		);
		failure = error ? "Your progress couldn’t be saved." : "";
	}

	async function remember(changes: PlaybackPreferencesUpdate) {
		const { error } = await attempt(
			savePlaybackPreferences(changes).updates(
				getPlaybackPreferences().withOverride((current) => ({
					...current,
					...changes,
					subtitles: {
						...current.subtitles,
						...changes.subtitles,
					},
				})),
			),
		);
		failure = error ? "Your player settings couldn’t be saved." : "";
	}

	$effect(() => {
		const timer = setInterval(() => {
			if (!player.paused && !player.buffering) {
				report();
			}
		}, 10_000);

		return () => clearInterval(timer);
	});

	$effect(() => {
		if (!preferences.auto_skip || !segment || skipped.has(segment.start)) {
			return;
		}

		skipped.add(segment.start);
		player.time = segment.end;
	});

	$effect(() => player.remember());

	onDestroy(() => report(false, true));
</script>

{#snippet cueNodes(nodes: Iterable<Node>)}
	{#each nodes as node (node)}
		{#if node instanceof Text}
			{node.data}
		{:else if node instanceof Element && cueTags.has(node.localName)}
			<svelte:element this={node.localName}>{@render cueNodes(node.childNodes)}</svelte:element>
		{:else if node instanceof Element}
			{@render cueNodes(node.childNodes)}
		{/if}
	{/each}
{/snippet}

<svelte:head>
	<title>{title} · {series.title} · Sora</title>
</svelte:head>

<StatusBanner message={failure} tone="error" ondismiss={() => (failure = "")} />

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
		{@attach player.stream(selected?.sources[0])}
		{@attach player.playback}
	>
		{#each selected?.subtitles ?? [] as track (track.url)}
			<track
				kind="captions"
				src={track.url}
				srclang={track.language}
				label={track.label}
				{@attach player.caption(track.url === subtitle)}
			/>
		{/each}
	</video>

	{#if loading}
		<CircleNotchIcon
			size="3rem"
			weight="bold"
			class="pointer-events-none z-1 animate-spin place-self-center text-accent motion-reduce:animate-none"
			aria-hidden="true"
		/>
	{/if}

	{#if segment}
		<div
			class="pointer-events-none z-1 mx-4 mb-32 self-end justify-self-end transition-[margin] duration-200 in-[.idle:not(:has(:popover-open))]:mb-[6vh] sm:mb-25"
		>
			<Button
				variant="primary"
				class="pointer-events-auto bg-white text-black shadow-lg shadow-black/50 transition-[background-color] duration-150 hover:bg-white/80 hover:brightness-100 motion-reduce:transition-none"
				onclick={() => (player.time = segment.end)}
			>
				{#if segment.kind === "opening"}
					Skip intro
				{:else}
					Skip credits
				{/if}
			</Button>
		</div>
	{/if}

	<div
		class="pointer-events-none z-1 mx-4 mb-(--cue-lift) flex flex-col items-center self-end transition-[margin] duration-200 [--cue-lift:8rem] in-[.idle:not(:has(:popover-open))]:mb-[7vh] sm:[--cue-lift:6.25rem]"
	>
		<div
			aria-hidden="true"
			class="text-center text-[clamp(20px,2.8vw,44px)] leading-tight font-semibold tracking-[0.02em] whitespace-pre-line [-webkit-text-stroke:0.1em_#000] [paint-order:stroke_fill] [text-shadow:0_2px_3px_#000]"
		>
			{#each player.cues as cue (cue)}
				<p>{@render cueNodes(cue.getCueAsHTML().childNodes)}</p>
			{/each}
		</div>
	</div>

	<header
		class="flex items-center gap-3 self-start bg-[linear-gradient(rgb(0_0_0/0.85),rgb(0_0_0/0.4)_60%,transparent)] px-4 pt-4 pb-12 transition-opacity duration-200 text-shadow-md in-[.idle:not(:has(:popover-open))]:pointer-events-none in-[.idle:not(:has(:popover-open))]:opacity-0"
	>
		<Button href={back} variant="icon" aria-label="Back to {series.title}">
			<ArrowLeftIcon size="1.5rem" weight="bold" />
		</Button>
		<div class="min-w-0">
			<h1 class="text-lg font-normal sm:text-xl">{episode.number}. {title}</h1>
			<p class="mt-0.5 text-sm text-foreground/90">{series.title}</p>
		</div>
	</header>

	<footer
		class="flex flex-col gap-3 self-end bg-linear-to-b from-transparent to-black/80 px-4 pt-12 pb-4 transition-opacity duration-200 in-[.idle:not(:has(:popover-open))]:pointer-events-none in-[.idle:not(:has(:popover-open))]:opacity-0"
	>
		<Controls {player} {previous} {next}>
			<Settings
				media={playback?.media ?? []}
				{selected}
				{subtitle}
				{preferences}
				{player}
				onpreferences={remember}
			/>
		</Controls>
	</footer>
</section>
