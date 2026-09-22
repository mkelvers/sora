import { z } from 'zod';

/** Copies byte chunks, in order, into a new byte array of the supplied total size. */
export function concatByteChunks(chunks: Uint8Array[], size: number) {
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
    }
    return bytes;
}

/** Narrows nullable collection values so downstream code can use their concrete fields. */
export function isNotNullish<T>(value: T): value is Exclude<T, null | undefined> {
    return value !== null && value !== undefined;
}

/** Recursive value shape permitted by JSON, excluding undefined and non-JSON objects. */
export type JsonValue =
    | string
    | number
    | boolean
    | null
    | JsonValue[]
    | { [key: string]: JsonValue };

/** Returns a JSON object value, or `null` when the input is not an object. */
export function record(value: JsonValue | undefined): Record<string, JsonValue> | null {
    const parsed = z.record(z.string(), z.json()).safeParse(value);
    return parsed.success ? parsed.data : null;
}

/** Parses a positive safe integer supplied as a JSON number or digit string. */
export function positiveInteger(value: JsonValue | undefined) {
    const parsed = z.union([z.number(), z.string().regex(/^\d+$/)]).safeParse(value);
    const number = parsed.success ? Number(parsed.data) : Number.NaN;
    return Number.isSafeInteger(number) && number > 0 ? number : undefined;
}

/** Trims a JSON string and returns `undefined` when it is empty or not a string. */
export function text(value: JsonValue | undefined) {
    const parsed = z.string().trim().min(1).safeParse(value);
    return parsed.success ? parsed.data : undefined;
}
