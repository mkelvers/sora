import { defined } from "@sora/shared";
import sharp from "sharp";

/** A still's picture in grey, measured at 320 by 180, which TMDB serves directly. */
export class Frame {
	static readonly #width = 320;
	static readonly #height = 180;

	readonly #data: Buffer;

	constructor(data: Buffer) {
		this.#data = data;
	}

	/** Reads `image` at the size it is measured at. */
	static async of(image: Buffer): Promise<Frame> {
		const { data } = await sharp(image)
			.resize(Frame.#width, Frame.#height, {
				fit: "fill",
			})
			.greyscale()
			.raw()
			.toBuffer({
				resolveWithObject: true,
			});

		return new Frame(data);
	}

	/** The share of the frame black bars take up along its widest edge; see `blackBars`. */
	get bars(): number {
		const width = Frame.#width;
		const height = Frame.#height;

		const rows = Frame.#lines(height, width, (line, index) =>
			defined(this.#data[line * width + index]),
		);

		const columns = Frame.#lines(width, height, (line, index) =>
			defined(this.#data[index * width + line]),
		);

		return Math.max(
			Frame.#depth(rows),
			Frame.#depth(rows.toReversed()),
			Frame.#depth(columns),
			Frame.#depth(columns.toReversed()),
		);
	}

	static #depth(
		edge: {
			brightest: number;
			mean: number;
		}[],
	) {
		/** A black edge wider than this share of the frame is a dark frame, not a bar. */
		const widestBar = 0.4;

		/**
		 * A bar ends in a step: the lines just past it are brighter, on average,
		 * than the ones just inside it by at least this much. A dark scene fades.
		 */
		const barStep = 10;

		/**
		 * A line of pixels counts as black when all but its brightest 2% are below
		 * this luma. Lossy compression leaves a bar's pixels up to about 12; a dark
		 * scene's vignette is above it within a few lines of the edge.
		 */
		const blackLuma = 12;

		let bar = 0;

		while (bar < edge.length && defined(edge[bar]).brightest < blackLuma) {
			bar += 1;
		}

		if (bar === 0 || bar > edge.length * widestBar) {
			return 0;
		}

		const inside = Math.max(...edge.slice(Math.max(0, bar - 2), bar).map((line) => line.mean));
		const outside = Math.max(...edge.slice(bar, bar + 2).map((line) => line.mean));

		if (outside - inside >= barStep) {
			return bar / edge.length;
		}

		return 0;
	}

	static #lines(count: number, length: number, at: (line: number, index: number) => number) {
		return Array.from(
			{
				length: count,
			},
			(_, line) => {
				const values = Array.from(
					{
						length,
					},
					(_value, index) => at(line, index),
				).toSorted((left, right) => left - right);

				return {
					brightest: defined(values[Math.floor(length * 0.98)]),
					mean: values.reduce((sum, value) => sum + value, 0) / length,
				};
			},
		);
	}
}
