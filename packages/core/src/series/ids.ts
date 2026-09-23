/**
 * Sora's own IDs for series and seasons, the only IDs clients see.
 *
 * IDs are random rather than sequential or derived from AniList, so they
 * reveal nothing about the catalogue and never change when a series is laid
 * out again. The prefix tells a series ID from a season ID at a glance.
 */

const alphabet = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

/** 12 base-62 characters: about 71 bits, far beyond any catalogue's size. */
const idLength = 12;

/** Bytes at or above this would bias the modulo towards the first characters. */
const unbiasedByteLimit = 256 - (256 % alphabet.length);

/** Creates a new series ID, such as `a_4kQ9vB2xLm0T`. */
export function newSeriesId() {
  return `a_${randomText()}`;
}

/** Creates a new season ID, such as `s_Zp81rTq0cW5e`. */
export function newSeasonId() {
  return `s_${randomText()}`;
}

function randomText() {
  let text = "";
  while (text.length < idLength) {
    for (const byte of crypto.getRandomValues(new Uint8Array(idLength * 2))) {
      if (byte < unbiasedByteLimit && text.length < idLength) {
        text += alphabet[byte % alphabet.length];
      }
    }
  }

  return text;
}
