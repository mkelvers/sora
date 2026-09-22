/** Splits values into ordered groups; `size` must be a positive safe integer. */
export function batches<T>(values: readonly T[], size: number) {
    if (!Number.isSafeInteger(size) || size <= 0) {
        throw new RangeError('Batch size must be a positive integer');
    }
    const result: T[][] = [];
    for (let index = 0; index < values.length; index += size) {
        result.push(values.slice(index, index + size));
    }
    return result;
}
