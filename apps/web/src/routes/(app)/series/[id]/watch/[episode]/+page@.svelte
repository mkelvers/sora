<script lang="ts">
	import type { PageProps } from "./$types";
	import Player from "./components/Player.svelte";
	import { getEpisode, getPlayback, getPlaybackPreferences, getProgress } from "./watch.remote";

	let { params }: PageProps = $props();

	const address = $derived({
		seriesId: params.id,
		episode: params.episode,
	});
	const { series, episode } = $derived(await getEpisode(address));
	const preferences = $derived(await getPlaybackPreferences());
	const progress = $derived(await getProgress(address));
	const playback = $derived(getPlayback(address));
</script>

<main id="main-content" tabindex="-1">
	<Player {series} {episode} playback={playback.current} {preferences} {progress} />
</main>
