/**
 * The contract of every `/v1` route: path, parameters, and documented
 * responses. The server validates requests against these and the OpenAPI
 * document is generated from them, so the two cannot disagree. Each
 * resource's contract and handlers live side by side in `resources/`.
 *
 * `operationId`s name the methods of clients generated for other languages
 * (Kotlin, Swift). They are part of the public contract: never rename one
 * within `/v1`.
 */
import { deviceRoute } from "../resources/devices/contract";
import { notificationRoute } from "../resources/notifications/contract";
import { nowWatchingRoute } from "../resources/now-watching/contract";
import { playbackRoute } from "../resources/playback/contract";
import { profileRoute } from "../resources/profiles/contract";
import { progressRoute } from "../resources/progress/contract";
import { seriesRoute } from "../resources/series/contract";
import { transferRoute } from "../resources/transfer/contract";
import { watchlistRoute } from "../resources/watchlist/contract";

/**
 * Every `/v1` route by its operation name, which `@sora/sdk` calls them by.
 * Importing this starts no server and touches no database.
 */
export const route = {
	...seriesRoute,
	...playbackRoute,
	...deviceRoute,
	...profileRoute,
	...transferRoute,
	...progressRoute,
	...watchlistRoute,
	...notificationRoute,
	...nowWatchingRoute,
};
