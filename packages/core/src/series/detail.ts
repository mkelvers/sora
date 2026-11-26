import sharp from "sharp";

/**
 * How wide a picture really is: the narrowest it can be shrunk to without
 * losing detail anyone could see, or its own width when it has none to lose.
 * A backdrop TMDB lists as 3840×2160 is often a smaller picture enlarged,
 * and an upscaler redraws it best from the size it was drawn at.
 *
 * Measured by blurring the picture as much as shrinking it to a fraction of
 * its width would, and seeing how much its brightness changes: an enlarged
 * picture has nothing a blur can take away.
 */
export const trueWidth = async (picture: Uint8Array): Promise<number> => {
	/** Fractions of its width tried, the widest first. */
	const fractions = [3 / 4, 1 / 2, 3 / 8, 1 / 4];

	/**
	 * The peak signal-to-noise ratio, in decibels, above which a blur took
	 * nothing visible. A 4K backdrop enlarged from about 1080p keeps 43.6 dB
	 * when blurred to half its width; backdrops with real detail at their full
	 * size keep at most 39.3 dB at three quarters.
	 */
	const unchangedAbove = 41;

	/** The largest difference in brightness one pixel can have. */
	const peak = 255;

	const { data, info } = await sharp(picture).removeAlpha().toColourspace("srgb").raw().toBuffer({
		resolveWithObject: true,
	});

	const { channels, height, width } = info;
	const pixels = width * height;

	// A Gaussian of this sigma passes about what that fraction of the pixels can show.
	const blurs = await Promise.all(
		fractions.map(async (fraction) => ({
			blurred: await sharp(data, {
				raw: {
					channels,
					height,
					width,
				},
			})
				.blur(0.5 / fraction)
				.raw()
				.toBuffer(),
			fraction,
		})),
	);

	let narrowest = width;

	for (const { blurred, fraction } of blurs) {
		let squared = 0;

		for (let pixel = 0; pixel < pixels; pixel += 1) {
			const offset = pixel * channels;

			// Brightness as Rec. 601 weighs the channels.
			const difference =
				0.299 * (data.readUInt8(offset) - blurred.readUInt8(offset)) +
				0.587 * (data.readUInt8(offset + 1) - blurred.readUInt8(offset + 1)) +
				0.114 * (data.readUInt8(offset + 2) - blurred.readUInt8(offset + 2));

			squared += difference * difference;
		}

		const ratio = 10 * Math.log10((peak * peak) / Math.max(squared / pixels, Number.EPSILON));

		if (ratio < unchangedAbove) {
			break;
		}

		narrowest = Math.round(width * fraction);
	}

	return narrowest;
};
