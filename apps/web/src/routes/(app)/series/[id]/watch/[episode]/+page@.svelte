<script lang="ts">
	import type { PageProps } from "./$types";
	import Player from "./components/Player.svelte";
	import { getEpisode, getPlayback, getPlaybackPreferences, getProgress } from "./watch.remote";

	let { params }: PageProps = $props();

	const address = $derived({
		seriesId: params.id,
		episode: params.episode,
	});
	const [{ series, episode }, preferences, progress] = $derived(
		await Promise.all([getEpisode(address), getPlaybackPreferences(), getProgress(address)]),
	);
	const playback = $derived(getPlayback(address));
</script>

<main id="main-content" tabindex="-1">
	<Player {series} {episode} playback={playback.current} {preferences} {progress} />
</main>
