<script lang="ts">
	import { afterNavigate, goto } from "$app/navigation";
	import Cue from "$lib/components/cue.svelte";
	import StatusBanner from "$lib/components/status-banner.svelte";
	import Button from "$lib/components/ui/button.svelte";
	import { nextEpisodeAddress } from "$lib/series-navigation";
	import { failedPlayback } from "$routes/(app)/series/[id]/series.svelte";
	import {
		getEpisode,
		getPlayback,
		getPlaybackPreferences,
		getProgress,
		savePlaybackPreferences,
		saveProgress,
	} from "$routes/(app)/series/[id]/watch/[episode]/watch.remote";
	import { Player } from "$routes/(app)/series/[id]/watch/[episode]/watch.svelte";
	import { chooseVersion } from "@sora/sdk";
	import type {
		Episode,
		PlaybackPreferences,
		PlaybackPreferencesUpdate,
		Progress,
		Series,
	} from "@sora/sdk";
	import { attempt } from "@sora/shared";
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

	const previous = $derived.by(() => {
		if (!playback?.previous) {
			return;
		}

		return `/series/${series.id}/watch/${playback.previous}`;
	});

	const nextAddress = $derived.by(() => {
		if (!playback) {
			return;
		}

		return nextEpisodeAddress(series, episode.number, playback.next);
	});

	const next = $derived.by(() => {
		if (!nextAddress) {
			return;
		}

		return `/series/${nextAddress.seriesId}/watch/${nextAddress.episode}`;
	});

	const start = $derived.by(() => {
		if (progress && !progress.finished) {
			return progress.position_seconds;
		}

		return 0;
	});

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

	const upcoming = $derived.by(() => {
		if (!nearing) {
			return;
		}

		return nextAddress;
	});

	$effect(() => {
		if (upcoming) {
			void [getEpisode(upcoming), getPlayback(upcoming), getProgress(upcoming)].map(
				(query) => query.current,
			);
		}
	});

	const media = $derived.by(() => {
		if (playback?.status === "ready") {
			return playback.media;
		}

		return [];
	});

	const chosen = $derived(chooseVersion(media, preferences));
	const selected = $derived(chosen.media);
	const subtitle = $derived(chosen.subtitle?.url);

	const subject = $derived.by(() => {
		if (series.format === "MOVIE") {
			return series.title;
		}

		return `Episode ${episode.number}`;
	});

	const playbackFailure = $derived.by(() => {
		if (selected || playbackQuery?.loading) {
			return;
		}

		if (playbackQuery?.error || playback?.status === "failed") {
			return {
				message: `${subject} couldn’t be loaded.`,
				retry: true,
			};
		}

		if (playback?.status === "temporary") {
			return {
				message: `${subject} is temporarily unavailable.`,
				retry: true,
			};
		}

		if (playback?.status === "unavailable") {
			return {
				message: `${subject} isn’t available to watch.`,
				retry: false,
			};
		}
	});

	const loading = $derived.by(() => {
		if (selected) {
			return player.buffering;
		}

		return playbackQuery?.loading ?? true;
	});

	let cameFromSeries = false;
	let sentBack = false;

	afterNavigate(({ from }) => {
		cameFromSeries = from?.url.pathname === back;
	});

	$effect(() => {
		if (!playbackFailure || sentBack) {
			return;
		}

		sentBack = true;

		const query = playbackQuery;
		let retry;

		if (playbackFailure.retry && query) {
			retry = {
				href: `/series/${series.id}/watch/${episode.number}`,
				refresh: () => query.refresh(),
			};
		}

		failedPlayback.current = {
			message: playbackFailure.message,
			retry,
			seriesId: series.id,
		};

		if (cameFromSeries) {
			history.back();

			return;
		}

		goto(back, {
			replace: true,
		});
	});

	const isAtTop = (cue: VTTCue) => {
		if (cue.line === "auto") {
			return false;
		}

		if (cue.snapToLines) {
			return cue.line >= 0;
		}

		return cue.line < 50;
	};

	const topCues = $derived(player.cues.filter((cue) => isAtTop(cue)));
	const bottomCues = $derived(player.cues.filter((cue) => !isAtTop(cue)));

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
			let message = "";

			if (failed) {
				message = progressError;
			}

			failure = message;
		}
	});

	const report = (ended = false, leaving = false) => {
		const { duration, time } = player;

		const measurable =
			Number.isFinite(duration) && duration >= 1 && Number.isFinite(time) && time >= 0;

		if (measurable) {
			session.lastSnapshot = undefined;

			if (time > 0 || ended) {
				session.lastSnapshot = {
					duration_seconds: Math.floor(duration),
					finished: ended || (session.ending !== undefined && time >= session.ending),
					position_seconds: Math.floor(time),
				};
			}
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
		const moved =
			address.seriesId !== session.address.seriesId ||
			address.episode !== session.address.episode ||
			address.profileId !== session.address.profileId;

		if (moved) {
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

		let message = "";

		if (error) {
			message = "Your player settings couldn’t be saved.";
		}

		failure = message;
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
		const stay = !preferences.auto_skip || !segment || skipped.has(segment.start);

		if (stay) {
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

	<p role="status" class="sr-only">
		{#if loading}
			Loading playback…
		{/if}
	</p>

	{#if segment}
		<div
			class="pointer-events-none z-1 mx-4 mb-32 self-end justify-self-end transition-[margin] duration-200 in-[.idle:not(:has(:popover-open))]:mb-[6vh] sm:mb-25"
		>
			<Button
				variant="primary"
				class="pointer-events-auto border-white bg-white text-black shadow-lg shadow-black/50 transition-[background-color] duration-150 hover:bg-white/80 hover:brightness-100 motion-reduce:transition-none"
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
		class="pointer-events-none z-1 mx-4 mt-(--cue-drop) flex flex-col items-center self-start text-[clamp(20px,2.8vw,44px)] transition-[margin] duration-200 [--cue-drop:5.5rem] in-[.idle:not(:has(:popover-open))]:mt-[5vh]"
	>
		{#each topCues as cue (cue)}
			<Cue appearance={preferences.subtitle_style}>
				{@render cueNodes(cue.getCueAsHTML().childNodes)}
			</Cue>
		{/each}
	</div>

	<div
		class="pointer-events-none z-1 mx-4 mb-(--cue-lift) flex flex-col items-center self-end text-[clamp(20px,2.8vw,44px)] transition-[margin] duration-200 [--cue-lift:8rem] in-[.idle:not(:has(:popover-open))]:mb-[7vh] sm:[--cue-lift:6.25rem]"
	>
		{#each bottomCues as cue (cue)}
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
