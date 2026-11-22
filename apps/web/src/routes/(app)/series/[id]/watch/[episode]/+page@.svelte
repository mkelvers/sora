<script lang="ts">
	import { browser } from "$app/env";

	import type { PageProps } from "./$types";
	import Player from "./components/player.svelte";
	import { getEpisode, getPlayback, getPlaybackPreferences, getProgress } from "./watch.remote";

	let { params }: PageProps = $props();

	const address = $derived({
		episode: params.episode,
		seriesId: params.id,
	});
	const [{ series, episode }, preferences, { profileId, progress }] = $derived(
		await Promise.all([getEpisode(address), getPlaybackPreferences(), getProgress(address)]),
	);
	// A non-awaited SSR query can still be pending at hydration, which would
	// make the browser resolve playback again and bypass the first Retry-After.
	const playbackQuery = $derived(browser ? getPlayback(address) : undefined);
</script>

<main id="main-content" tabindex="-1">
	<Player {series} {episode} {playbackQuery} {preferences} {profileId} {progress} />
</main>
