import { describe, expect, mock, test } from "bun:test";

mock.module("../../database/client", () => ({
	db: {},
}));

const { groupNotifications } = await import("./notifications");
type ReleasedEpisode = import("./notifications").ReleasedEpisode;

const monday = new Date("2026-09-28T15:00:00Z");
const tuesday = new Date("2026-09-29T15:00:00Z");

/** Episodes `from` to `to` of a series, released at `releasedAt`. */
function released(
	seriesId: string,
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
			seriesId,
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
	test("makes one notification of the episodes of a series that came out together", () => {
		const [notification, ...rest] = groupNotifications(released("slime", 4, 6, monday));

		expect(rest).toEqual([]);
		expect(notification).toMatchObject({
			id: "slime:4",
			kind: "episodes",
			firstEpisode: 4,
			lastEpisode: 6,
			episodeTitle: "Episode 6",
			stillUrl: "still-6",
			releasedAt: monday.toISOString(),
			unread: true,
		});
	});

	test("makes a notification of each moment and orders them newest first", () => {
		const groups = groupNotifications([
			...released("slime", 4, 4, monday),
			...released("slime", 5, 5, tuesday),
			...released("frieren", 9, 9, monday),
		]);

		expect(groups.map((group) => group.id)).toEqual(["slime:5", "slime:4", "frieren:9"]);
	});

	test("calls a group that starts with the first episode a premiere", () => {
		const [notification] = groupNotifications(released("slime", 1, 2, monday));

		expect(notification).toMatchObject({
			kind: "premiere",
			stillUrl: "still-1",
		});
	});

	test("leaves out a group the profile played an episode of", () => {
		const groups = groupNotifications([
			...released("slime", 4, 5, monday, {
				watched: false,
			}),
			...released("slime", 6, 6, monday, {
				watched: true,
			}),
			...released("slime", 7, 7, tuesday),
		]);

		expect(groups.map((group) => group.id)).toEqual(["slime:7"]);
	});

	test("lists a series that is only offered for its premiere alone", () => {
		const groups = groupNotifications(
			[
				...released("season-2", 1, 1, monday),
				...released("season-2", 2, 2, tuesday),
				...released("season-2", 1, 2, tuesday, {
					dubbed: true,
				}),
			],
			new Set(["season-2"]),
		);

		expect(groups.map((group) => group.id)).toEqual(["season-2:1"]);
	});

	test("keeps a dub when its episodes are played", () => {
		const [notification, ...rest] = groupNotifications(
			released("slime", 3, 4, monday, {
				dubbed: true,
				watched: true,
			}),
		);

		expect(rest).toEqual([]);
		expect(notification).toMatchObject({
			id: "slime:3:dub",
			kind: "dub",
			lastEpisode: 4,
		});
	});

	test("keeps the same ID when an episode's time is corrected", () => {
		const before = groupNotifications(released("slime", 4, 4, monday));
		const after = groupNotifications(released("slime", 4, 4, tuesday));

		expect(after[0]!.id).toBe(before[0]!.id);
	});

	test("leaves out deleted notifications and marks read ones", () => {
		const episodes = [...released("slime", 4, 4, monday), ...released("frieren", 9, 9, monday)];
		const groups = groupNotifications(
			episodes,
			new Set(),
			new Set(["slime:4"]),
			new Set(["frieren:9"]),
		);

		expect(groups.map((group) => [group.id, group.unread])).toEqual([["frieren:9", false]]);
	});
});
