<script lang="ts">
	import { goto } from "$app/navigation";
	import Cue from "$lib/components/cue.svelte";
	import StatusBanner from "$lib/components/status-banner.svelte";
	import Button from "$lib/components/ui/button.svelte";
	import { nextEpisodeAddress } from "$lib/series-navigation";
	import {
		getEpisode,
		getPlayback,
		getPlaybackPreferences,
		getProgress,
		savePlaybackPreferences,
		saveProgress,
	} from "$routes/(app)/series/[id]/watch/[episode]/watch.remote";
	import { Player } from "$routes/(app)/series/[id]/watch/[episode]/watch.svelte";
	import { choosePlayback } from "@sora/sdk";
	import type {
		Episode,
		PlaybackPreferences,
		PlaybackPreferencesUpdate,
		Progress,
		Series,
	} from "@sora/sdk";
	import { attempt, second } from "@sora/shared";
	import { CaretLeftIcon, CircleNotchIcon } from "phosphor-svelte";
	import { onDestroy, untrack } from "svelte";

	import Controls from "./controls.svelte";
	import { ProgressReports } from "./progress-reports";
	import type { ProgressAddress, ProgressSnapshot } from "./progress-reports";
	import Settings from "./settings.svelte";

	let {
		series,
		episode,
		playbackQuery,
		preferences,
		profileId,
		progress,
	}: {
		series: Series;
		episode: Episode;
		playbackQuery?: ReturnType<typeof getPlayback>;
		preferences: PlaybackPreferences;
		profileId: string;
		progress?: Progress | null;
	} = $props();

	const playback = $derived(playbackQuery?.current);
	const cueTags = new Set(["b", "i", "u", "ruby", "rt"]);

	const address = $derived<ProgressAddress>({
		episode: episode.number,
		profileId,
		seriesId: series.id,
	});

	const title = $derived(episode.title ?? `Episode ${episode.number}`);
	const label = $derived(`E${episode.number}`);

	const heading = $derived.by(() => {
		if (series.format === "MOVIE") {
			return title;
		}

		if (episode.title) {
			return `${label} – ${episode.title}`;
		}

		return label;
	});

	const back = $derived(`/series/${series.id}`);

	const previous = $derived(
		playback?.previous ? `/series/${series.id}/watch/${playback.previous}` : undefined,
	);

	const nextAddress = $derived(
		playback ? nextEpisodeAddress(series, episode.number, playback.next) : undefined,
	);

	const next = $derived(
		nextAddress ? `/series/${nextAddress.seriesId}/watch/${nextAddress.episode}` : undefined,
	);

	const start = $derived(progress && !progress.finished ? progress.position_seconds : 0);

	const player = new Player(
		untrack(() => start),
		untrack(() => preferences.quality),
		() => ({
			next,
			previous,
		}),
	);

	$effect(() => player.setQuality(preferences.quality));

	let failure = $state("");
	let nearing = $state(false);
	let skipped = new Set<number>();

	$effect(() => {
		if (player.duration > 0 && player.duration - player.time <= 60) {
			nearing = true;
		}
	});

	const upcoming = $derived(nearing ? nextAddress : undefined);

	$effect(() => {
		if (upcoming) {
			void [getEpisode(upcoming), getPlayback(upcoming), getProgress(upcoming)].map(
				(query) => query.current,
			);
		}
	});

	const media = $derived(playback?.status === "ready" ? playback.media : []);
	const chosen = $derived(choosePlayback(media, preferences));
	const selected = $derived(chosen.media);
	const subtitle = $derived(chosen.subtitle?.url);

	const playbackMessage = $derived.by(() => {
		if (selected) {
			return;
		}

		if (playbackQuery?.error || playback?.status === "failed") {
			return "Playback couldn’t be loaded.";
		}

		if (playback?.status === "unavailable") {
			return "This episode is unavailable to watch.";
		}

		if (playback?.status === "temporary") {
			return "Playback is temporarily unavailable.";
		}
	});

	const canRetry = $derived(!!playbackQuery?.error || playback?.status !== "unavailable");

	const retryAt = $derived(
		!playbackQuery?.error && playback?.status === "temporary" ? playback.retryAt : null,
	);

	const retrying = $derived(!!playbackMessage && playbackQuery?.loading === true);

	const loading = $derived(
		selected ? player.buffering : (playbackQuery?.loading ?? true) && !retrying,
	);

	let now = $state(Date.now());
	const retryDelayId = $props.id();

	const retryWait = $derived(
		retryAt === null ? 0 : Math.max(0, Math.ceil((retryAt - now) / second)),
	);

	$effect(() => {
		const deadline = retryAt;
		now = Date.now();

		if (deadline === null || deadline <= Date.now()) {
			return;
		}

		const interval = setInterval(() => {
			const time = Date.now();
			now = time;

			if (time >= deadline) {
				clearInterval(interval);
			}
		}, second);

		return () => clearInterval(interval);
	});

	const retryPlayback = async () => {
		if (!playbackQuery || playbackQuery.loading || (retryAt !== null && Date.now() < retryAt)) {
			return;
		}

		await attempt(playbackQuery.refresh());
	};

	const segment = $derived(
		selected?.skip_segments.find((skip) => player.time >= skip.start && player.time < skip.end),
	);

	const ending = $derived(
		selected?.skip_segments.find((candidate) => candidate.kind === "ending")?.start,
	);

	const progressError = "Your progress couldn’t be saved.";

	interface Session {
		address: ProgressAddress;
		ending?: number;
		lastSnapshot?: ProgressSnapshot;
	}

	let session: Session = untrack(() => ({
		address,
		ending,
	}));

	let destroyed = false;

	const reports = new ProgressReports(saveProgress, (saved, failed) => {
		if (destroyed || saved !== session.address) {
			return;
		}

		if (failed || failure === progressError) {
			failure = failed ? progressError : "";
		}
	});

	const report = (ended = false, leaving = false) => {
		const { duration, time } = player;

		if (Number.isFinite(duration) && duration >= 1 && Number.isFinite(time) && time >= 0) {
			session.lastSnapshot =
				time > 0 || ended
					? {
							duration_seconds: Math.floor(duration),
							finished: ended || (session.ending !== undefined && time >= session.ending),
							position_seconds: Math.floor(time),
						}
					: undefined;
		} else if (!leaving) {
			return;
		}

		if (session.lastSnapshot) {
			reports.enqueue(session.address, {
				...session.lastSnapshot,
				leaving,
			});
		}
	};

	$effect.pre(() => {
		if (
			address.seriesId !== session.address.seriesId ||
			address.episode !== session.address.episode ||
			address.profileId !== session.address.profileId
		) {
			// Capture the old episode and its credits before resetting the player.
			untrack(() => report(false, true));
			session = { address };

			if (failure === progressError) {
				failure = "";
			}

			nearing = false;
			skipped = new Set();
			player.load(start);
		}

		session.ending = ending;
	});

	const remember = async (changes: PlaybackPreferencesUpdate) => {
		const { error } = await attempt(
			savePlaybackPreferences(changes).updates(
				getPlaybackPreferences().withOverride((saved) => ({
					...saved,
					...changes,
					subtitle_style: {
						...saved.subtitle_style,
						...changes.subtitle_style,
					},
					subtitles: {
						...saved.subtitles,
						...changes.subtitles,
					},
				})),
			),
		);

		failure = error ? "Your player settings couldn’t be saved." : "";
	};

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

	onDestroy(() => {
		destroyed = true;
		report(false, true);
	});
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
	<title>Watch {series.title} Episode {episode.number} - Sora</title>
</svelte:head>

<StatusBanner message={failure} tone="error" ondismiss={() => (failure = "")} />

<svelte:window
	onkeydown={(event) => {
		if (selected || event.key === "N" || event.key === "P") {
			player.onkeydown(event);
		}
	}}
	onpointermove={player.wake}
/>
<svelte:document
	onvisibilitychange={() => {
		if (document.hidden) {
			report();
		}
	}}
/>

<section
	aria-label="Video player"
	tabindex="-1"
	class={[
		"grid h-dvh grid-cols-1 grid-rows-1 overflow-hidden bg-black text-white outline-none *:[grid-area:1/1]",
		selected && player.idle && !player.paused && "idle cursor-none",
	]}
	bind:this={player.root}
	{@attach (node) => node.focus({ preventScroll: true })}
>
	<video
		bind:currentTime={player.time}
		bind:duration={player.duration}
		bind:buffered={player.buffered}
		bind:volume={player.volume}
		bind:muted={player.muted}
		bind:playbackRate={player.speed}
		bind:readyState={player.readyState}
		class={["size-full object-cover", !selected && "pointer-events-none"]}
		aria-busy={loading}
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
			if (!preferences.autoplay_next) {
				return;
			}

			goto(next ?? back, {
				replace: true,
				reset: false,
			});
		}}
		{@attach player.stream(selected?.sources[0])}
		{@attach selected ? player.playback : undefined}
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

	<div class="pointer-events-none z-1 mx-4 place-self-center text-center">
		<p role="status" class={playbackMessage ? "text-lg font-semibold" : "sr-only"}>
			{#if retrying}
				Retrying playback…
			{:else if playbackMessage}
				{playbackMessage}
			{:else if loading}
				Loading playback…
			{/if}
		</p>
		{#if playbackMessage}
			{#if retryWait > 0}
				<p id={retryDelayId} class="mt-2 text-sm text-foreground/80">
					Try again in {retryWait}
					{retryWait === 1 ? "second" : "seconds"}.
				</p>
			{/if}
			{#if canRetry}
				<Button
					variant="primary"
					class="pointer-events-auto mt-4"
					aria-disabled={retrying || retryWait > 0}
					aria-describedby={retryWait > 0 ? retryDelayId : undefined}
					onclick={retryPlayback}
				>
					Retry playback
				</Button>
			{/if}
			<nav aria-label="Episode navigation" class="mt-3 flex flex-wrap justify-center gap-x-4">
				{#if previous}
					<Button href={previous} variant="plain" class="pointer-events-auto">
						Previous episode
					</Button>
				{/if}
				<Button href={back} variant="plain" class="pointer-events-auto">Back to series</Button>
				{#if next}
					<Button href={next} variant="plain" class="pointer-events-auto">Next episode</Button>
				{/if}
			</nav>
		{/if}
	</div>

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
					Skip Intro
				{:else}
					Skip Credits
				{/if}
			</Button>
		</div>
	{/if}

	<div
		class="pointer-events-none z-1 mx-4 mb-(--cue-lift) flex flex-col items-center self-end text-[clamp(20px,2.8vw,44px)] transition-[margin] duration-200 [--cue-lift:8rem] in-[.idle:not(:has(:popover-open))]:mb-[7vh] sm:[--cue-lift:6.25rem]"
	>
		{#each player.cues as cue (cue)}
			<Cue appearance={preferences.subtitle_style}>
				{@render cueNodes(cue.getCueAsHTML().childNodes)}
			</Cue>
		{/each}
	</div>

	<header
		class="flex items-center gap-3 self-start bg-[linear-gradient(rgb(0_0_0/0.6),transparent)] px-4 pt-4 pb-10 transition-opacity duration-200 text-shadow-md in-[.idle:not(:has(:popover-open))]:pointer-events-none in-[.idle:not(:has(:popover-open))]:opacity-0 sm:bg-[linear-gradient(rgb(0_0_0/0.45),transparent)]"
	>
		<Button
			href={back}
			variant="icon"
			class="text-white drop-shadow-md hover:text-white focus-visible:outline-white"
			aria-label="Back to {series.title}"
		>
			<CaretLeftIcon size="1.75rem" weight="bold" />
		</Button>
		<h1 class="min-w-0">
			<span class="block truncate text-base font-semibold">{series.title}</span>
			<span class="block truncate text-sm text-foreground/80">{heading}</span>
		</h1>
	</header>

	{#if selected}
		<footer
			class="flex flex-col gap-3 self-end bg-linear-to-b from-transparent to-black/80 px-4 pt-12 pb-4 transition-opacity duration-200 in-[.idle:not(:has(:popover-open))]:pointer-events-none in-[.idle:not(:has(:popover-open))]:opacity-0"
		>
			<Controls {player} {previous} {next}>
				<Settings {media} {selected} {subtitle} {preferences} {player} onpreferences={remember} />
			</Controls>
		</footer>
	{/if}
</section>
