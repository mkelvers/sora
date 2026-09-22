/**
 * Copies chunks, in order, into a new byte array.
 *
 * `size` must equal the sum of chunk lengths; callers calculate it while
 * collecting chunks so the destination has the exact final length.
 */
export function concatByteChunks(chunks: Uint8Array[], size: number) {
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
    }
    return bytes;
}
