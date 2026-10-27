import sharp from "sharp";

/** The width a picture is fetched at; TMDB serves this size directly. */
const fetchedWidth = 1280;

/** The size the picture is reduced to for measuring, keeping seams one column wide. */
const gridWidth = 640;
const gridHeight = 360;

/** How much brighter or darker one side of a column must be than the other to count as a hard edge. */
const edgeStep = 18;

/**
 * The share of a column's rows that must be hard edges for the column to be
 * a seam between panels. Scenes and character art reach about 0.6 where a
 * building or a shoulder lines up with a column; panels reach 0.9.
 */
const seamShare = 0.8;

/**
 * Whether a TMDB image is a collage of panels, such as four characters side
 * by side, rather than one picture: some column of it is a hard edge for
 * nearly its whole height. Measured from the picture, since TMDB's data says
 * nothing of it.
 *
 * @throws {Error} when the image cannot be fetched.
 */
export const isCollage = async (url: string): Promise<boolean> => {
	const sized = url.replace(/(?<prefix>\/image\.tmdb\.org\/t\/p\/)[^/]+/u, `$1w${fetchedWidth}`);
	const response = await fetch(sized, {
		signal: AbortSignal.timeout(15_000),
	});
	if (!response.ok) {
		throw new Error(`${sized} answered ${response.status}`);
	}

	const { data } = await sharp(Buffer.from(await response.arrayBuffer()))
		.resize({
			fit: "fill",
			height: gridHeight,
			width: gridWidth,
		})
		.greyscale()
		.raw()
		.toBuffer({
			resolveWithObject: true,
		});

	for (let x = 2; x < gridWidth - 2; x += 1) {
		let edges = 0;
		for (let y = 0; y < gridHeight; y += 1) {
			const row = y * gridWidth;
			const pixel = (offset: number) => data[row + x + offset] ?? 0;
			const step = Math.abs(pixel(1) + pixel(2) - pixel(-1) - pixel(0)) / 2;
			if (step >= edgeStep) {
				edges += 1;
			}
		}
		if (edges / gridHeight >= seamShare) {
			return true;
		}
	}
	return false;
};
