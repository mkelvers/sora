/**
 * Sora's own IDs for series, seasons, and profiles, the only IDs clients see.
 *
 * An ID is 9 random characters from 0-9 and A-Z, such as `GYZJ43JMR`, with
 * nothing telling one kind from another. IDs are random rather than
 * sequential or derived from AniList, so they reveal nothing about the
 * catalogue and never change when a series is laid out again.
 */

const alphabet = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/** 9 base-36 characters: about 46 bits, far beyond any catalogue's size. */
const idLength = 9;

/** Bytes at or above this would bias the modulo towards the first characters. */
const unbiasedByteLimit = 256 - (256 % alphabet.length);

/** Creates a new ID, such as `GYZJ43JMR`. */
export function newId() {
  let id = "";
  while (id.length < idLength) {
    for (const byte of crypto.getRandomValues(new Uint8Array(idLength * 2))) {
      if (byte < unbiasedByteLimit && id.length < idLength) {
        id += alphabet[byte % alphabet.length];
      }
    }
  }

  return id;
}
