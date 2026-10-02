import { describe, expect, mock, test } from "bun:test";

import type { PlayableSeason } from "../../series/queries";

mock.module("../../database/client", () => ({
	db: {},
}));

const { groupNotifications } = await import("./notifications");
type ReleasedEpisode = import("./notifications").ReleasedEpisode;

const monday = new Date("2026-09-28T15:00:00Z");
const tuesday = new Date("2026-09-29T15:00:00Z");

function season(id: string, overrides: Partial<PlayableSeason> = {}): PlayableSeason {
	return {
		id,
		kind: "season",
		number: 1,
		title: "Season 1",
		inWatchOrder: true,
		airing: true,
		episodes: Array.from(
			{
				length: 12,
			},
			(_, index) => index + 1,
		),
		releasedAt: tuesday,
		...overrides,
	};
}

function seasons(...listed: PlayableSeason[]) {
	return new Map(listed.map((entry) => [entry.id, entry]));
}

/** Episodes `from` to `to` of a season, released at `releasedAt`. */
function released(
	seasonId: string,
	from: number,
	to: number,
	releasedAt: Date,
	overrides: Partial<ReleasedEpisode> = {},
): ReleasedEpisode[] {
	return Array.from(
		{
			length: to - from + 1,
		},
		(_, index) => ({
			seriesId: "slime",
			seasonId,
			number: from + index,
			title: `Episode ${from + index}`,
			stillUrl: `still-${from + index}`,
			releasedAt,
			watched: false,
			dubbed: false,
			...overrides,
		}),
	);
}

describe("groupNotifications", () => {
	test("makes one notification of the episodes of a season that came out together", () => {
		const [notification, ...rest] = groupNotifications(
			released("s1", 4, 6, monday),
			seasons(season("s1")),
		);

		expect(rest).toEqual([]);
		expect(notification).toMatchObject({
			id: "s1:4",
			kind: "episodes",
			firstEpisode: 4,
			lastEpisode: 6,
			episodeTitle: "Episode 6",
			stillUrl: "still-6",
			releasedAt: monday.toISOString(),
			unread: true,
		});
	});

	test("calls a group that starts a season a new season, shown by its first episode", () => {
		const [notification] = groupNotifications(
			released("s2", 1, 12, monday),
			seasons(
				season("s2", {
					number: 2,
					title: "Season 2",
				}),
			),
		);

		expect(notification).toMatchObject({
			kind: "season",
			season: {
				id: "s2",
				kind: "season",
				number: 2,
				title: "Season 2",
			},
			firstEpisode: 1,
			lastEpisode: 12,
			stillUrl: "still-1",
		});
	});

	test("calls a film a new season", () => {
		const [notification] = groupNotifications(
			released("film", 1, 1, monday),
			seasons(
				season("film", {
					kind: "movie",
					title: "Infinity Castle",
					episodes: [1],
				}),
			),
		);

		expect(notification?.kind).toBe("season");
		expect(notification?.season.kind).toBe("movie");
	});

	test("calls a season new by its first playable episode, whatever its number", () => {
		const [notification] = groupNotifications(
			released("s1", 2, 2, monday),
			seasons(
				season("s1", {
					episodes: [2, 3],
				}),
			),
		);

		expect(notification?.kind).toBe("season");
	});

	test("keeps episodes of one season released at different moments apart, newest first", () => {
		const notifications = groupNotifications(
			[...released("s2", 1, 1, monday), ...released("s2", 2, 2, tuesday)],
			seasons(season("s2")),
		);

		expect(notifications.map((item) => [item.kind, item.firstEpisode])).toEqual([
			["episodes", 2],
			["season", 1],
		]);
	});

	test("keeps seasons released at the same moment apart", () => {
		const notifications = groupNotifications(
			[...released("s1", 5, 5, monday), ...released("s2", 1, 1, monday)],
			seasons(season("s1"), season("s2")),
		);

		expect(notifications.map((item) => item.id).toSorted()).toEqual(["s1:5", "s2:1"]);
	});

	test("leaves out an episode that cannot be played yet", () => {
		const notifications = groupNotifications(
			released("s1", 4, 5, monday),
			seasons(
				season("s1", {
					episodes: [1, 2, 3, 4],
				}),
			),
		);

		expect(notifications.map((item) => [item.firstEpisode, item.lastEpisode])).toEqual([[4, 4]]);
	});

	test("leaves out an episode of a season that is not listed", () => {
		expect(groupNotifications(released("gone", 1, 1, monday), seasons(season("s1")))).toEqual([]);
	});

	test("leaves out a notification once one of its episodes is watched", () => {
		const notifications = groupNotifications(
			[
				...released("s1", 4, 4, monday),
				...released("s1", 5, 5, monday, {
					watched: true,
				}),
				...released("s1", 6, 6, tuesday),
			],
			seasons(season("s1")),
		);

		expect(notifications.map((item) => item.id)).toEqual(["s1:6"]);
	});

	test("leaves out a notification the user deleted", () => {
		const notifications = groupNotifications(
			[...released("s1", 5, 5, monday), ...released("s1", 6, 6, tuesday)],
			seasons(season("s1")),
			new Set(["s1:5"]),
		);

		expect(notifications.map((item) => item.id)).toEqual(["s1:6"]);
	});

	test("lists a notification the user marked read as read", () => {
		const notifications = groupNotifications(
			[...released("s1", 5, 5, monday), ...released("s1", 6, 6, tuesday)],
			seasons(season("s1")),
			new Set(),
			new Set(["s1:5"]),
		);

		expect(notifications.map((item) => [item.id, item.unread])).toEqual([
			["s1:6", true],
			["s1:5", false],
		]);
	});

	test("keeps a notification's ID when its release time is corrected", () => {
		const [before] = groupNotifications(released("s1", 5, 5, monday), seasons(season("s1")));
		const [after] = groupNotifications(released("s1", 5, 5, tuesday), seasons(season("s1")));

		expect(after?.id).toBe(before!.id);
	});

	test("makes one notification of the episodes of a season dubbed together", () => {
		const [notification, ...rest] = groupNotifications(
			released("s1", 1, 3, monday, {
				dubbed: true,
			}),
			seasons(season("s1")),
		);

		expect(rest).toEqual([]);
		expect(notification).toMatchObject({
			id: "s1:1:dub",
			kind: "dub",
			firstEpisode: 1,
			lastEpisode: 3,
			stillUrl: "still-3",
			releasedAt: monday.toISOString(),
		});
	});

	test("keeps a dub apart from the episodes that came out at the same moment", () => {
		const notifications = groupNotifications(
			[
				...released("s1", 5, 5, monday),
				...released("s1", 2, 2, monday, {
					dubbed: true,
				}),
			],
			seasons(season("s1")),
		);

		expect(notifications.map((item) => [item.id, item.kind]).toSorted()).toEqual([
			["s1:2:dub", "dub"],
			["s1:5", "episodes"],
		]);
	});

	test("keeps a dub of episodes the user watched, until they delete it", () => {
		const dubbed = released("s1", 4, 4, monday, {
			dubbed: true,
			watched: true,
		});

		expect(groupNotifications(dubbed, seasons(season("s1"))).map((item) => item.id)).toEqual([
			"s1:4:dub",
		]);
		expect(groupNotifications(dubbed, seasons(season("s1")), new Set(["s1:4:dub"]))).toEqual([]);
	});

	test("leaves out the dub of an episode that cannot be played", () => {
		expect(
			groupNotifications(
				released("s1", 5, 5, monday, {
					dubbed: true,
				}),
				seasons(
					season("s1", {
						episodes: [1, 2, 3, 4],
					}),
				),
			),
		).toEqual([]);
	});
});
