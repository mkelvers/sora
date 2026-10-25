<script lang="ts">
	import type { PageProps } from "./$types";
	import Player from "./components/player.svelte";
	import { getEpisode, getPlayback, getPlaybackPreferences, getProgress } from "./watch.remote";

	let { params }: PageProps = $props();

	const address = $derived({
		episode: params.episode,
		seriesId: params.id,
	});
	const [{ series, episode }, preferences, progress] = $derived(
		await Promise.all([getEpisode(address), getPlaybackPreferences(), getProgress(address)]),
	);
	const playback = $derived(getPlayback(address));
</script>

<main id="main-content" tabindex="-1">
	<Player {series} {episode} playback={playback.current} {preferences} {progress} />
</main>
