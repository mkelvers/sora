<script lang="ts">
	import { goto } from "$app/navigation";
	import StatusBanner from "$lib/components/StatusBanner.svelte";
	import { attempt } from "@sora/attempt";
	import type { PlaybackPreferencesUpdate } from "@sora/sdk";

	import type { PageProps } from "./$types";
	import Player from "./components/Player.svelte";
	import {
		getEpisode,
		getPlayback,
		getPlaybackPreferences,
		getProgress,
		savePlaybackPreferences,
		saveProgress,
	} from "./watch.remote";

	let { params }: PageProps = $props();

	const address = $derived({
		seriesId: params.id,
		episode: params.episode,
	});
	const { series, episode } = $derived(await getEpisode(address));
	const preferences = $derived(await getPlaybackPreferences());
	const progress = $derived(await getProgress(address));

	const playback = $derived(getPlayback(address));
	const next = $derived(playback.current?.next ?? undefined);
	const previous = $derived(playback.current?.previous ?? undefined);

	const key = $derived(`${series.id}/${episode.number}`);
	let nearing = $state<string>();
	let failure = $state("");

	const upcoming = $derived(
		nearing === key && next
			? {
					seriesId: series.id,
					episode: String(next),
				}
			: undefined,
	);
	const preload = $derived(
		upcoming && [getEpisode(upcoming), getPlayback(upcoming), getProgress(upcoming)],
	);

	$effect(() => {
		for (const query of preload ?? []) {
			void query.current;
		}
	});

	const title = $derived(episode.title ?? `Episode ${episode.number}`);

	async function report(position: number, duration: number, finished: boolean, leaving: boolean) {
		const { error } = await attempt(
			saveProgress({
				seriesId: series.id,
				episode: episode.number,
				position_seconds: Math.floor(position),
				duration_seconds: Math.floor(duration),
				finished,
				leaving,
			}),
		);
		failure = error ? "Your progress couldn’t be saved." : "";
	}

	async function remember(changes: PlaybackPreferencesUpdate) {
		const { error } = await attempt(() =>
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
</script>

<svelte:head>
	<title>{title} · {series.title} · Sora</title>
</svelte:head>

<StatusBanner message={failure} tone="error" ondismiss={() => (failure = "")} />

<main id="main-content" tabindex="-1">
	<Player
		id={key}
		media={playback.current?.media}
		back="/series/{series.id}"
		previous={previous ? `/series/${series.id}/watch/${previous}` : undefined}
		next={next ? `/series/${series.id}/watch/${next}` : undefined}
		title="{episode.number}. {title}"
		series={series.title}
		{preferences}
		start={progress && !progress.finished ? progress.position_seconds : 0}
		onprogress={report}
		onpreferences={remember}
		onnearend={() => (nearing = key)}
		onended={() =>
			goto(next ? `/series/${series.id}/watch/${next}` : `/series/${series.id}`, {
				replaceState: true,
				noScroll: true,
				keepFocus: !!next,
			})}
	/>
</main>
