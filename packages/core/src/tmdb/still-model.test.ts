import { expect, test } from "bun:test";

import labelEmbeddings from "./still-labels.generated.json";
import { labelPrompt, stillLabels, stillModel } from "./still-model";

test("still-labels.generated.json holds the embedding of every label, made with the model stills use", () => {
	expect(labelEmbeddings.model).toBe(stillModel);
	expect(labelEmbeddings.labels).toEqual(stillLabels.map(labelPrompt));
	for (const embedding of labelEmbeddings.embeddings) {
		expect(embedding).toHaveLength(512);
		expect(Math.hypot(...embedding)).toBeCloseTo(1, 5);
	}
});
