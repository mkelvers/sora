/**
 * Writes `still-labels.generated.json`: the text embeddings of the labels stills are
 * told apart by, made with the full 32-bit text half of CLIP. Run it after
 * changing `stillLabels`: `bun run stills:embed-labels`.
 */
import { writeFile } from "node:fs/promises";

import { AutoTokenizer, CLIPTextModelWithProjection } from "@huggingface/transformers";

import { labelPrompt, stillLabels, stillModel, unitLength } from "./still-model";

const prompts = stillLabels.map(labelPrompt);

const [tokenizer, text] = [
	await AutoTokenizer.from_pretrained(stillModel),
	await CLIPTextModelWithProjection.from_pretrained(stillModel, {
		dtype: "fp32",
	}),
];

const { text_embeds: embeds } = await text(
	tokenizer(prompts, {
		padding: true,
		truncation: true,
	}),
);

const [, width = 0] = embeds.dims;
const { data } = embeds;

if (!(data instanceof Float32Array)) {
	throw new TypeError("The text model did not return float32 embeddings");
}

await writeFile(
	new URL("still-labels.generated.json", import.meta.url),
	`${JSON.stringify({
		embeddings: prompts.map((_prompt, index) =>
			unitLength([...data.subarray(index * width, (index + 1) * width)]).map((value) =>
				Number(value.toPrecision(8)),
			),
		),
		labels: prompts,
		model: stillModel,
	})}\n`,
);

console.log(`Embedded ${prompts.length} labels with ${stillModel}`);
