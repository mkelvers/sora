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
import { contract as devices } from "../resources/devices/contract";
import { contract as notifications } from "../resources/notifications/contract";
import { contract as nowWatching } from "../resources/now-watching/contract";
import { contract as playback } from "../resources/playback/contract";
import { contract as profiles } from "../resources/profiles/contract";
import { contract as progress } from "../resources/progress/contract";
import { contract as series } from "../resources/series/contract";
import { contract as transfer } from "../resources/transfer/contract";
import { contract as watchlist } from "../resources/watchlist/contract";

/**
 * Every `/v1` route by its operation name, which `@sora/sdk` calls them by.
 * Importing this starts no server and touches no database.
 */
export const route = {
	...series,
	...playback,
	...devices,
	...profiles,
	...transfer,
	...progress,
	...watchlist,
	...notifications,
	...nowWatching,
};
