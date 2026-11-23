interface FailedPlayback {
	seriesId: string;
	message: string;
	retry?: {
		href: string;
		/** Refetches the player's own playback query, so its cached failure isn't reused. */
		refresh: () => Promise<void>;
	};
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
