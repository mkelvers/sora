import { z } from "zod";

/** What a TMDB episode's change log holds: English text by field, the last runtime, and the stills it adds. */
export class ChangeLog {
	static readonly schema = z.object({
		changes: z.array(
			z.object({
				items: z.array(
					z.object({
						action: z.string(),
						iso_639_1: z
							.string()
							.nullish()
							.transform((value) => value || null),
						original_value: z.unknown().optional(),
						/** `YYYY-MM-DD HH:MM:SS UTC`. */
						time: z.string(),
						// A deletion has no value, an addition no original one.
						value: z.unknown().optional(),
					}),
				),
				key: z.string(),
			}),
		),
	});

	static readonly #changedImage = z.object({
		backdrop: z.object({
			file_path: z.string(),
		}),
	});

	readonly #changes: z.infer<typeof ChangeLog.schema>["changes"];

	constructor(changes: z.infer<typeof ChangeLog.schema>["changes"]) {
		this.#changes = changes;
	}

	/** The last English text of `key`, or `null` when none was written. */
	text(key: string): string | null {
		const value = this.#edits(key).findLast((edit) => edit.iso_639_1 === "en")?.value;
		const parsed = z.string().min(1).safeParse(value);

		if (!parsed.success) {
			return null;
		}

		return parsed.data;
	}

	/** The last runtime written, in whatever language its writer used; `null` without a valid one. */
	get runtime(): number | null {
		const written = this.#edits("runtime").at(-1)?.value;

		return z.number().positive().nullable().catch(null).parse(written);
	}

	/** The stills added and not deleted since, in the order they were added. */
	get stills(): Set<string> {
		const stills = new Set<string>();

		for (const edit of this.#edits("images")) {
			const added = ChangeLog.#changedImage.safeParse(edit.value);
			const removed = ChangeLog.#changedImage.safeParse(edit.original_value);

			if (edit.action === "deleted" && removed.success) {
				stills.delete(removed.data.backdrop.file_path);
			} else if (added.success) {
				stills.add(added.data.backdrop.file_path);
			}
		}

		return stills;
	}

	#edits(key: string) {
		return (this.#changes.find((change) => change.key === key)?.items ?? []).toSorted(
			(left, right) => left.time.localeCompare(right.time),
		);
	}
}
