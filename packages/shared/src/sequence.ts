/**
 * Runs `work` for each item one after another, never two at once, and
 * resolves to the results in order. Stops at the first rejection.
 *
 * For work that must not overlap, such as calls sharing a rate limit; work
 * that may overlap belongs in `Promise.all`.
 */
export const inSequence = <TItem, TResult>(
	items: readonly TItem[],
	work: (item: TItem, index: number) => Promise<TResult>,
): Promise<TResult[]> => {
	const results: TResult[] = [];
	const step = async (index: number): Promise<TResult[]> => {
		if (index >= items.length) {
			return results;
		}
		results.push(await work(items[index] as TItem, index));
		return await step(index + 1);
	};
	return step(0);
};

/**
 * Runs `work` on each item in turn until one resolves to something other
 * than `undefined` or `null`, and resolves to that; `undefined` when none does.
 */
export const firstInSequence = <TItem, TResult>(
	items: readonly TItem[],
	work: (item: TItem, index: number) => Promise<TResult | undefined>,
): Promise<TResult | undefined> => {
	const step = async (index: number): Promise<TResult | undefined> => {
		if (index >= items.length) {
			return undefined;
		}
		return (await work(items[index] as TItem, index)) ?? (await step(index + 1));
	};
	return step(0);
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
	let next = 0;
	const worker = async (): Promise<void> => {
		if (signal?.aborted || next >= items.length) {
			return;
		}
		const item = items[next] as TItem;
		next += 1;
		await work(item);
		await worker();
	};
	await Promise.all(Array.from({ length: concurrency }, worker));
};

/** `items` cut into consecutive groups of at most `size`, the last one possibly shorter. */
export const chunked = <TItem>(items: readonly TItem[], size: number): TItem[][] =>
	Array.from({ length: Math.ceil(items.length / size) }, (_, group) =>
		items.slice(group * size, (group + 1) * size),
	);
