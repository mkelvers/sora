import { describe, expect, test } from "bun:test";

import type { AnimeCard } from "../../catalog/models/anime";
import { continuePoint, type EpisodeProgress } from "./resume";

const anime: AnimeCard = {
  id: 154587,
  malId: 52991,
  title: {
    display: "Frieren",
    english: "Frieren",
    romaji: "Sousou no Frieren",
    native: null
  },
  coverUrl: null,
  coverColor: null,
  bannerUrl: null,
  format: "TV",
  status: "FINISHED",
  season: "FALL",
  seasonYear: 2023,
  episodes: 28,
  durationMinutes: 24,
  score: 90,
  popularity: 1,
  genres: [],
  nextEpisode: null,
  isAdult: false
};

const checkpoint = (episode: number, positionSeconds: number, completed: boolean): EpisodeProgress => ({
  episode,
  positionSeconds,
  durationSeconds: 1440,
  completed,
  eventAt: "2026-01-01T00:00:00.000Z"
});

describe("continuePoint", () => {
  test("resumes an unfinished latest episode", () => {
    expect(continuePoint(anime, [checkpoint(3, 600, false)])).toEqual({
      episode: 3,
      positionSeconds: 600,
      durationSeconds: 1440
    });
  });

  test("moves to the next episode after completing one", () => {
    expect(continuePoint(anime, [checkpoint(3, 1400, true)])).toEqual({
      episode: 4,
      positionSeconds: 0,
      durationSeconds: null
    });
  });

  test("resumes the next episode's own checkpoint when it was started earlier", () => {
    expect(continuePoint(anime, [
      checkpoint(1, 1400, true),
      checkpoint(2, 300, false)
    ])).toEqual({
      episode: 2,
      positionSeconds: 300,
      durationSeconds: 1440
    });
  });

  test("ends after the final episode of a finished series", () => {
    expect(continuePoint(anime, [checkpoint(28, 1400, true)])).toBeNull();
  });

  test("waits for an airing show's next episode", () => {
    const airing: AnimeCard = {
      ...anime,
      status: "RELEASING",
      episodes: null,
      nextEpisode: {
        number: 5,
        airingAt: "2026-01-08T00:00:00.000Z"
      }
    };

    expect(continuePoint(airing, [checkpoint(3, 1400, true)])?.episode).toBe(4);
    expect(continuePoint(airing, [checkpoint(4, 1400, true)])).toBeNull();
  });
});
