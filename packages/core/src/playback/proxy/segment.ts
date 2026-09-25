const pngSignature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
/** The `IEND` chunk type and its fixed CRC, which end every PNG file. */
const pngEnd = Uint8Array.from([0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82]);
const tsPacketSize = 188;
const tsSyncByte = 0x47;

/**
 * Whether a segment begins with an image header, which some hosts (AniKoto's
 * CDNs among them) prepend to MPEG-TS segments to disguise them as images.
 * Only the first bytes are needed.
 */
export function isDisguisedSegment(head: Uint8Array) {
  const png = pngSignature.every((byte, index) => head[index] === byte);
  const jpeg = head[0] === 0xff && head[1] === 0xd8;
  return png || jpeg;
}

/**
 * Removes a prepended image from a disguised MPEG-TS segment.
 *
 * A PNG is cut at its `IEND` chunk. Anything else is cut at the first
 * position where TS sync bytes repeat at packet intervals, since JPEG end
 * markers can also occur inside the image data.
 *
 * @returns the segment unchanged when no transport stream is found.
 */
export function unwrapDisguisedSegment<Backing extends ArrayBufferLike>(bytes: Uint8Array<Backing>) {
  const end = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).indexOf(pngEnd);
  if (end >= 0) {
    return bytes.subarray(end + pngEnd.length);
  }

  for (let offset = 0; offset + 2 * tsPacketSize < bytes.length; offset += 1) {
    if (
      bytes[offset] === tsSyncByte &&
      bytes[offset + tsPacketSize] === tsSyncByte &&
      bytes[offset + 2 * tsPacketSize] === tsSyncByte
    ) {
      return bytes.subarray(offset);
    }
  }

  return bytes;
}
