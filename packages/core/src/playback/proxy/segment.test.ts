import { describe, expect, test } from "bun:test";

import { isDisguisedSegment, unwrapDisguisedSegment } from "./segment";

/** Three MPEG-TS packets, each starting with the sync byte. */
const transportStream = Uint8Array.from({
  length: 188 * 3
}, (_, index) => (index % 188 === 0 ? 0x47 : 0x00));

describe("disguised segments", () => {
  test("strip a prepended PNG at its IEND chunk", () => {
    const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x01, 0x47, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82]);
    const disguised = Buffer.concat([png, transportStream]);

    expect(isDisguisedSegment(disguised)).toBe(true);
    expect(unwrapDisguisedSegment(disguised)).toEqual(transportStream);
  });

  test("strip a prepended JPEG at the first run of TS packets", () => {
    // A stray 0x47 inside the image must not be mistaken for the stream start.
    const jpeg = Uint8Array.from([0xff, 0xd8, 0x47, 0x10, 0xff, 0xd9]);
    const disguised = Buffer.concat([jpeg, transportStream]);

    expect(isDisguisedSegment(disguised)).toBe(true);
    expect(unwrapDisguisedSegment(disguised)).toEqual(transportStream);
  });

  test("leave plain transport streams alone", () => {
    expect(isDisguisedSegment(transportStream)).toBe(false);
  });
});
