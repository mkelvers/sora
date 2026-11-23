interface FailedPlayback {
	seriesId: string;
	episode: number;
	message: string;
	retry: boolean;
}

/**
 * The playback the player gave up on, which the series page announces after
 * the player sends the viewer back to it. Only the browser writes it, so it
 * never leaks between requests on the server.
 */
export const failedPlayback = $state<{
	current: FailedPlayback | null;
}>({
	current: null,
});
