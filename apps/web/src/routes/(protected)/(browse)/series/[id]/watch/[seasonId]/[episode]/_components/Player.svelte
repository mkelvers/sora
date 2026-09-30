<script lang="ts">
	import { beforeNavigate } from "$app/navigation";
	import Button from "$lib/components/ui/Button.svelte";
	import { Player } from "$routes/(protected)/(browse)/series/[id]/watch/[seasonId]/[episode]/watch.svelte";
	import type { PlaybackMedia } from "@sora/sdk";
	import { ArrowLeftIcon } from "phosphor-svelte";
	import { untrack } from "svelte";

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
		season?: string;
		start: number;
		onprogress: (position: number, duration: number) => Promise<void>;
		onnearend: () => void;
		onended: () => void;
	};

	let {
		id,
		media: versions,
		back,
		previous,
		next,
		title,
		series,
		season,
		start,
		onprogress,
		onnearend,
		onended,
	}: Props = $props();

	const player = new Player(untrack(() => start));

	let reported = -1;
	let nearing = false;
	let current = untrack(() => id);

	$effect.pre(() => {
		if (id === current) {
			return;
		}

		current = id;
		reported = -1;
		nearing = false;
		player.load(start);
	});

	$effect(() => {
		if (nearing || player.duration <= 0 || player.duration - player.time > 60) {
			return;
		}

		nearing = true;
		untrack(onnearend);
	});

	beforeNavigate(report);

	async function end() {
		const duration = player.duration;
		if (Number.isFinite(duration) && duration > 0) {
			reported = Math.floor(duration);
			await onprogress(duration, duration);
		}

		onended();
	}

	function report() {
		const position = Math.floor(player.time);
		if (!Number.isFinite(player.duration) || player.duration <= 0) {
			return;
		}
		if (position <= 0 || position === reported) {
			return;
		}

		reported = position;
		onprogress(position, player.duration);
	}

	$effect(() => {
		if (player.paused) {
			return;
		}

		const interval = setInterval(report, 10_000);
		return () => {
			clearInterval(interval);
			report();
		};
	});

	let preferred = $state<PlaybackMedia["audio"]>();
	const audio = $derived(
		versions?.find((version) => version.audio === preferred)?.audio ?? versions?.[0]?.audio,
	);
	const media = $derived(versions?.find((version) => version.audio === audio));
	let subtitle = $derived(media?.subtitles.find((track) => track.default)?.url);

	const loading = $derived(!versions || (media !== undefined && player.buffering));

	const segment = $derived(
		media?.skip_segments.find((segment) => {
			return player.time >= segment.start && player.time < segment.end;
		}),
	);

	$effect(() => player.remember());
</script>

<svelte:window onkeydown={player.onkeydown} onpointermove={player.wake} onpagehide={report} />

<section
	aria-label="Video player"
	class={[
		"grid h-dvh grid-cols-[minmax(0,1fr)] grid-rows-[minmax(0,1fr)] overflow-hidden bg-black text-white *:[grid-area:1/1]",
		player.idle && !player.paused && "idle cursor-none",
		loading &&
			"after:pointer-events-none after:size-12 after:animate-[spin_800ms_linear_infinite] after:place-self-center after:rounded-full after:border-3 after:border-white/20 after:border-t-white after:content-[''] after:[grid-area:1/1]",
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
		class="size-full object-contain"
		crossorigin="anonymous"
		autoplay
		playsinline
		onpointerdown={player.onpointerdown}
		onclick={player.onclick}
		ondblclick={player.toggleFullscreen}
		onplay={() => (player.paused = false)}
		onpause={() => (player.paused = true)}
		onended={end}
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
				class="pointer-events-auto self-end shadow-[0_2px_12px_rgb(0_0_0/0.6)]"
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
			class="text-center text-[clamp(18px,2.6vw,40px)] leading-tight font-semibold whitespace-pre-line [-webkit-text-stroke:0.14em_#000] [paint-order:stroke_fill] [text-shadow:0_2px_6px_rgb(0_0_0/0.6)]"
		>
			{#each player.cues as cue (cue)}
				<p {@attach (element) => element.replaceChildren(cue.getCueAsHTML())}></p>
			{/each}
		</div>
	</div>

	<header
		class="flex items-center gap-3 self-start bg-[linear-gradient(rgb(0_0_0/0.85),rgb(0_0_0/0.4)_60%,transparent)] px-4 pt-4 pb-12 transition-opacity duration-200 [text-shadow:0_1px_4px_rgb(0_0_0/0.8)] in-[.idle:not(:has(:popover-open))]:pointer-events-none in-[.idle:not(:has(:popover-open))]:opacity-0"
	>
		<Button href={back} variant="icon" size="lg" aria-label="Back to {series}">
			<ArrowLeftIcon size="1.5rem" weight="bold" />
		</Button>
		<div class="min-w-0">
			<h1 class="text-lg font-normal sm:text-xl">{title}</h1>
			<p class="mt-0.5 flex items-center gap-2 text-sm text-[#ddd]">
				{series}
				{#if season}
					<span
						class="before:mr-2 before:inline-block before:size-1 before:rotate-45 before:bg-current before:align-middle before:content-['']"
					>
						{season}
					</span>
				{/if}
			</p>
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
				bind:subtitle
				bind:audio={() => audio, (value) => (preferred = value)}
			/>
		</Controls>
	</footer>
</section>
