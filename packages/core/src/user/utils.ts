import { z } from 'zod';

export type JsonValue =
    | string
    | number
    | boolean
    | null
    | JsonValue[]
    | { [key: string]: JsonValue };

export function record(value: JsonValue | undefined): Record<string, JsonValue> | null {
    const parsed = z.record(z.string(), z.json()).safeParse(value);
    return parsed.success ? parsed.data : null;
}

export function positiveInteger(value: JsonValue | undefined) {
    const parsed = z.union([z.number(), z.string().regex(/^\d+$/)]).safeParse(value);
    const number = parsed.success ? Number(parsed.data) : Number.NaN;
    return Number.isSafeInteger(number) && number > 0 ? number : undefined;
}

export function text(value: JsonValue | undefined) {
    const parsed = z.string().trim().min(1).safeParse(value);
    return parsed.success ? parsed.data : undefined;
}

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
