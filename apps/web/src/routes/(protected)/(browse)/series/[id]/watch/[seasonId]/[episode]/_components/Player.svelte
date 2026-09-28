<script lang="ts">
	import type { PlaybackMedia } from "@sora/sdk";
	import { untrack } from "svelte";
	import { beforeNavigate } from "$app/navigation";
	import { CaretLeftIcon } from "phosphor-svelte";
	import Button from "$lib/components/ui/Button.svelte";
	import Spinner from "$lib/components/ui/Spinner.svelte";
	import { tmdbImage } from "$lib/utils";
	import Controls from "./Controls.svelte";
	import Settings from "./Settings.svelte";
	import { Player } from "../watch.svelte";

	type Props = {
		id: string;
		media: PlaybackMedia[] | undefined;
		problem: string | null | undefined;
		onretry: () => void;
		back: string;
		previous?: string;
		next?: string;
		title: string;
		series: string;
		season?: string;
		logo: string | null;
		overview: string | null;
		start: number;
		onprogress: (position: number, duration: number) => Promise<void>;
		onnearend: () => void;
		onended: () => void;
	};

	let {
		id,
		media: versions,
		problem,
		onretry,
		back,
		previous,
		next,
		title,
		series,
		season,
		logo,
		overview,
		start,
		onprogress,
		onnearend,
		onended,
	}: Props = $props();

	const player = new Player();
	player.time = untrack(() => start);
	player.load(untrack(() => start));

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
		versions?.find((version) => version.audio === preferred)?.audio ??
			versions?.[0]?.audio,
	);
	const media = $derived(
		versions?.find((version) => version.audio === audio),
	);
	let subtitle = $derived(
		media?.subtitles.find((track) => track.default)?.url,
	);

	const failure = $derived(problem ?? player.failure);
	const loading = $derived(!failure && (!versions || player.buffering));
	const hidden = $derived(player.idle && !player.paused);
	const segment = $derived(
		media?.skip_segments.find((segment) => {
			return player.time >= segment.start && player.time < segment.end;
		}),
	);
</script>

<svelte:window
	onkeydown={player.onkeydown}
	onpointermove={player.wake}
	onpagehide={report}
/>
<svelte:document onfullscreenchange={player.onfullscreenchange} />

<div
	bind:this={player.root}
	class={[
		"group fixed inset-0 size-full overflow-hidden bg-black text-white select-none",
		player.idle && !player.paused && "cursor-none",
	]}
	aria-busy={loading}
>
	<video
		bind:paused={player.paused}
		bind:currentTime={player.time}
		bind:duration={player.duration}
		bind:buffered={player.buffered}
		bind:volume={player.volume}
		bind:muted={player.muted}
		bind:playbackRate={player.speed}
		bind:readyState={player.readyState}
		class="size-full bg-black object-cover"
		crossorigin="anonymous"
		playsinline
		onpointerdown={player.onpointerdown}
		onclick={player.onclick}
		ondblclick={player.toggleFullscreen}
		onerror={() => (player.failure ??= "The video could not be played.")}
		onended={end}
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

	<div
		class={[
			"pointer-events-none absolute inset-x-0 top-0 z-30 flex items-center justify-between bg-linear-to-b from-black/90 via-black/50 to-transparent p-5 transition-opacity duration-300 sm:p-7 lg:p-9",
			hidden && "opacity-0",
		]}
	>
		<a
			href={back}
			aria-label="Back to {series}"
			class="pointer-events-auto grid size-10 place-items-center text-white/90 drop-shadow transition-[color,opacity,transform] duration-150 hover:text-white hover:opacity-75 active:scale-90"
		>
			<CaretLeftIcon size="2rem" weight="bold" />
		</a>

		<div class="absolute inset-x-0 mx-auto max-w-[60vw] text-center">
			<p class="truncate text-sm font-bold tracking-wide drop-shadow sm:text-base">{series}</p>
			<p class="mt-0.5 truncate text-xs font-medium text-white/75 drop-shadow sm:text-sm">{season ? `${season} · ${title}` : title}</p>
		</div>

		<div class="size-11" aria-hidden="true"></div>
	</div>

	<div
		class={[
			"pointer-events-none absolute inset-y-0 left-0 z-10 w-full max-w-3xl bg-linear-to-r from-black/75 via-black/40 via-70% to-transparent transition-opacity duration-300 sm:max-w-4xl lg:max-w-5xl xl:max-w-6xl",
			player.paused && !failure ? "opacity-100" : "opacity-0",
		]}
	></div>

	{#if !failure}
		<div
			class={[
				"pointer-events-none absolute inset-y-0 left-8 z-20 flex max-w-xl flex-col items-start justify-center transition-opacity duration-300 sm:left-14 sm:max-w-2xl lg:left-20 lg:max-w-3xl",
				player.paused && !loading ? "opacity-100" : "opacity-0",
			]}
		>
			{#if logo}
				<img
					src={tmdbImage(logo, "w500")}
					alt={series}
					class="mb-4 h-[clamp(3rem,4.5vw,6rem)] max-w-[70vw] object-contain object-left drop-shadow-[0_4px_16px_rgba(0,0,0,0.95)] sm:max-w-sm md:max-w-md lg:max-w-lg"
				/>
			{:else}
				<p class="mb-3 text-3xl font-black tracking-tight drop-shadow-[0_3px_12px_rgba(0,0,0,0.95)] sm:text-4xl md:text-5xl">
					{series}
				</p>
			{/if}

			<h1 class="text-2xl font-extrabold tracking-tight drop-shadow-[0_3px_12px_rgba(0,0,0,0.95)] sm:text-3xl md:text-4xl">
				{title}
			</h1>

			{#if overview}
				<p class="mt-4 line-clamp-4 max-w-xl text-sm leading-relaxed text-white/90 drop-shadow-[0_2px_8px_rgba(0,0,0,0.95)] sm:line-clamp-5 sm:max-w-2xl sm:text-base md:text-lg lg:max-w-3xl">
					{overview}
				</p>
			{/if}
		</div>
	{/if}

	{#if player.cues.length}
		<div
			class={[
				"pointer-events-none absolute inset-x-6 z-10 flex flex-col items-center gap-1 text-center text-[clamp(1.125rem,2.6vw,2.5rem)] leading-snug font-semibold whitespace-pre-line transition-[bottom] duration-200",
				hidden ? "bottom-[6vh]" : "bottom-32",
			]}
		>
			{#each player.cues as cue (cue)}
				<p class="subtitle-outline m-0 px-2 py-0.5" {@attach (element) => element.replaceChildren(cue.getCueAsHTML())}></p>
			{/each}
		</div>
	{/if}

	{#if failure}
		<div role="alert" class="absolute inset-0 z-20 grid place-items-center bg-black px-6 text-center">
			<div>
				<p class="text-base font-bold">{failure}</p>
				<Button
					class="mt-5 min-h-11 border border-white/60 px-5 text-sm font-bold transition-[border-color,transform] duration-150 hover:border-white active:scale-[0.97]"
					onclick={() => {
						player.failure = undefined;
						onretry();
					}}
				>
					Try again
				</Button>
			</div>
		</div>
	{:else if loading}
		<div role="status" aria-label="Loading video" class="pointer-events-none absolute inset-0 grid place-items-center bg-black/40">
			<Spinner size="2.5rem" />
		</div>
	{/if}

	{#if segment && !failure}
		<Button
			class="absolute right-4 bottom-28 z-30 min-h-11 bg-white/95 px-5 text-sm font-bold text-black shadow-[0_3px_14px_rgba(0,0,0,0.3)] transition-[background-color,scale] duration-200 hover:bg-white active:scale-[0.97] sm:right-6 sm:bottom-32"
			onclick={() => (player.time = segment.end)}
		>
			{segment.kind === "opening" ? "Skip intro" : "Skip credits"}
		</Button>
	{/if}

	<Controls {player} {previous} {next} {hidden}>
		<Settings
			media={versions ?? []}
			subtitles={media?.subtitles ?? []}
			bind:speed={player.speed}
			bind:subtitle
			bind:audio={() => audio, (value) => (preferred = value)}
		/>
	</Controls>
</div>
