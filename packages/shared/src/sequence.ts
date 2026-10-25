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
 * than `undefined`, and resolves to that; `undefined` when none does.
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
