/**
 * CLIP as episode stills use it, to tell a scene from a title card or other
 * text: only its vision half runs, at 8 bits, scored against the text
 * embeddings of {@link stillLabels} kept in `still-labels.generated.json`, made once
 * with the full text half. That keeps the scheduler near 300 MB while it
 * reads stills, where the whole model at 32 bits took up to 900 MB.
 *
 * Kept apart from `stills.ts`, which reads the configuration, so the image
 * build can fetch the model with {@link loadStillModel} alone.
 */
import labelEmbeddings from "./still-labels.generated.json";

export const stillModel = "Xenova/clip-vit-base-patch32";

export const sceneLabel = "a frame from an anime episode";

/** What CLIP is asked to tell a scene from; the scene is the first. */
export const stillLabels = [
	sceneLabel,
	"a title card with large text or a logo",
	"a promotional poster with a logo",
	"a black screen with text",
];

/** How a label is put to CLIP, as Transformers.js's zero-shot pipeline puts it. */
export const labelPrompt = (label: string) => `This is a photo of ${label}`;

/** CLIP's learned temperature, which scales each similarity before the softmax. */
const logitScale = 100;

const dot = (left: readonly number[], right: readonly number[]) =>
	left.reduce((sum, value, index) => sum + value * (right[index] ?? 0), 0);

/** A vector scaled to length 1, so the dot product of two is their cosine similarity. */
export const unitLength = (vector: readonly number[]) => {
	const length = Math.hypot(...vector);
	return vector.map((value) => value / length);
};

/**
 * Loads the vision half of {@link stillModel} into `cacheDir`, or the
 * dependency's own folder, fetching it on first use.
 *
 * @returns How much of CLIP's probability an image gets for {@link sceneLabel}.
 * @throws {Error} when `still-labels.generated.json` was made for other labels; run
 *   `bun run stills:embed-labels` after changing them.
 */
export const loadStillModel = async (cacheDir: string | null) => {
	if (
		labelEmbeddings.model !== stillModel ||
		labelEmbeddings.labels.join("\n") !== stillLabels.map(labelPrompt).join("\n")
	) {
		throw new Error(
			"still-labels.generated.json does not match the labels; run bun run stills:embed-labels",
		);
	}

	const { AutoProcessor, CLIPVisionModelWithProjection, env, RawImage } =
		await import("@huggingface/transformers");
	if (cacheDir) {
		env.cacheDir = cacheDir;
	}
	const processor = await AutoProcessor.from_pretrained(stillModel);
	const vision = await CLIPVisionModelWithProjection.from_pretrained(stillModel, {
		dtype: "q8",
	});

	return async (image: Buffer) => {
		const { image_embeds: embeds } = await vision(
			await processor(await RawImage.fromBlob(new Blob([new Uint8Array(image)]))),
		);
		const embedded = unitLength([...(embeds.data as Float32Array)]);
		const logits = labelEmbeddings.embeddings.map((label) => logitScale * dot(label, embedded));
		const highest = Math.max(...logits);
		const weights = logits.map((logit) => Math.exp(logit - highest));
		return (weights[0] ?? 0) / weights.reduce((sum, weight) => sum + weight, 0);
	};
};
