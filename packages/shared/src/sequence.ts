export const sequence = {
	/**
	 * Runs `work` for each item one after another, never two at once, and
	 * resolves to the results in order. Stops at the first rejection.
	 *
	 * For work that must not overlap, such as calls sharing a rate limit; work
	 * that may overlap belongs in `Promise.all`.
	 */
	all<TItem, TResult>(
		items: readonly TItem[],
		work: (item: TItem, index: number) => Promise<TResult>,
	): Promise<TResult[]> {
		const results: TResult[] = [];
		const entries = items.entries();

		const step = async (): Promise<TResult[]> => {
			const next = entries.next();

			if (next.done) {
				return results;
			}

			const [index, item] = next.value;
			results.push(await work(item, index));

			return await step();
		};

		return step();
	},

	/**
	 * Runs `work` on each item in turn until one resolves to something other
	 * than `undefined` or `null`, and resolves to that; `undefined` when none does.
	 */
	first<TItem, TResult>(
		items: readonly TItem[],
		work: (item: TItem, index: number) => Promise<TResult | undefined>,
	): Promise<TResult | undefined> {
		const entries = items.entries();

		const step = async (): Promise<TResult | undefined> => {
			const next = entries.next();

			if (next.done) {
				return undefined;
			}

			const [index, item] = next.value;

			return (await work(item, index)) ?? (await step());
		};

		return step();
	},
};

/**
 * Runs `work` for every item with at most `concurrency` running at once,
 * each worker taking the next item when it finishes one. Resolves once all
 * are done. No more items start after `signal` aborts; those running finish.
 */
export const inParallel = async <TItem>(
	items: readonly TItem[],
	concurrency: number,
	work: (item: TItem) => Promise<void>,
	signal?: AbortSignal,
): Promise<void> => {
	const remaining = items.values();

	const worker = async (): Promise<void> => {
		const next = remaining.next();

		if (signal?.aborted || next.done) {
			return;
		}

		await work(next.value);
		await worker();
	};

	await Promise.all(Array.from({ length: concurrency }, worker));
};

/** `items` cut into consecutive groups of at most `size`, the last one possibly shorter. */
export const chunked = <TItem>(items: readonly TItem[], size: number): TItem[][] =>
	Array.from({ length: Math.ceil(items.length / size) }, (_, group) =>
		items.slice(group * size, (group + 1) * size),
	);
