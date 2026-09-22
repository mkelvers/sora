/** Narrows nullable collection values so downstream code can use their concrete fields. */
export function isNotNullish<T>(value: T): value is Exclude<T, null | undefined> {
    return value !== null && value !== undefined;
}
