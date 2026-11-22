import { isDisguised, unwrapDisguised } from "./segment";
import type { StreamTarget } from "./token";
import { readTarget } from "./upstream";

/** A segment ready to send, with any disguise already removed. */
export interface Segment {
	bytes: Uint8Array<ArrayBuffer>;
	contentType: string | null;
}

/** A segment fetched whole from upstream. */
export class Download {
	readonly #target: StreamTarget;

	constructor(target: StreamTarget) {
		this.#target = target;
	}

	/**
	 * The segment, ready to send.
	 *
	 * @throws {StreamUpstreamError} when the upstream and its mirrors fail.
	 */
	async segment(): Promise<Segment> {
		const { bytes: body, headers } = await readTarget(this.#target);
		const disguised = isDisguised(body);
		const contentType = headers.get("Content-Type");
		let bytes = body;

		if (disguised) {
			bytes = unwrapDisguised(body);
		}

		// Strict players (AVPlayer, ExoPlayer) reject the image type disguised
		// segments arrive with, so restore the real one.
		const mislabelled = disguised || (contentType && /^(?:image|text)\//iu.test(contentType));

		if (mislabelled) {
			return {
				bytes,
				contentType: "video/mp2t",
			};
		}

		return {
			bytes,
			contentType,
		};
	}
}
