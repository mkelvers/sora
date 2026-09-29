import { describe, expect, mock, test } from "bun:test";

mock.module("../../database/client", () => ({
	db: {},
}));

const { groupNotifications } = await import("./notifications");
type ReleasedEpisode = import("./notifications").ReleasedEpisode;

const baseline = new Date("2026-09-01T00:00:00Z");
const monday = new Date("2026-09-28T15:00:00Z");
const tuesday = new Date("2026-09-29T15:00:00Z");

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
			seasonKind: "season",
			seasonNumber: 1,
			seasonTitle: "Season 1",
			number: from + index,
			title: `Episode ${from + index}`,
			stillUrl: `still-${from + index}`,
			releasedAt,
			watched: false,
			...overrides,
		}),
	);
}

describe("groupNotifications", () => {
	test("makes one notification of the episodes of a season that came out together", () => {
		const [notification, ...rest] = groupNotifications(
			released("s1", 4, 6, monday),
			new Map([["s1", baseline]]),
			null,
		);

		expect(rest).toEqual([]);
		expect(notification).toMatchObject({
			kind: "episodes",
			firstEpisode: 4,
			lastEpisode: 6,
			episodeTitle: "Episode 6",
			stillUrl: "still-6",
			unread: true,
		});
	});

	test("calls a season with nothing out before it a new season, shown by its first episode", () => {
		const [notification] = groupNotifications(
			released("s2", 1, 12, monday, {
				seasonNumber: 2,
				seasonTitle: "Season 2",
			}),
			new Map([["s2", monday]]),
			null,
		);

		expect(notification).toMatchObject({
			kind: "season",
			season: {
				id: "s2",
				title: "Season 2",
			},
			firstEpisode: 1,
			lastEpisode: 12,
			stillUrl: "still-1",
		});
	});

	test("calls a film a new season", () => {
		const [notification] = groupNotifications(
			released("film", 1, 1, monday, {
				seasonKind: "movie",
				seasonTitle: "Infinity Castle",
			}),
			new Map([["film", monday]]),
			null,
		);

		expect(notification?.kind).toBe("season");
		expect(notification?.season.kind).toBe("movie");
	});

	test("makes new episodes of a new season, coming out later, episodes", () => {
		const notifications = groupNotifications(
			[...released("s2", 1, 1, monday), ...released("s2", 2, 2, tuesday)],
			new Map([["s2", monday]]),
			null,
		);

		expect(notifications.map((item) => [item.kind, item.firstEpisode])).toEqual([
			["episodes", 2],
			["season", 1],
		]);
	});

	test("keeps episodes of one season released at different moments apart, newest first", () => {
		const notifications = groupNotifications(
			[...released("s1", 5, 5, monday), ...released("s1", 6, 6, tuesday)],
			new Map([["s1", baseline]]),
			null,
		);

		expect(notifications.map((item) => item.lastEpisode)).toEqual([6, 5]);
	});

	test("keeps seasons released at the same moment apart", () => {
		const notifications = groupNotifications(
			[
				...released("s1", 5, 5, monday),
				...released("ova", 1, 2, monday, {
					seasonKind: "ova",
				}),
			],
			new Map([
				["s1", baseline],
				["ova", monday],
			]),
			null,
		);

		expect(notifications).toHaveLength(2);
	});

	test("leaves out a notification the user watched an episode of", () => {
		const notifications = groupNotifications(
			[
				...released("s1", 5, 5, monday, {
					watched: true,
				}),
				...released("s1", 6, 7, tuesday),
			],
			new Map([["s1", baseline]]),
			null,
		);

		expect(notifications.map((item) => item.firstEpisode)).toEqual([6]);
	});

	test("marks what came out after the user last saw their notifications unread", () => {
		const notifications = groupNotifications(
			[...released("s1", 5, 5, monday), ...released("s1", 6, 6, tuesday)],
			new Map([["s1", baseline]]),
			monday,
		);

		expect(notifications.map((item) => [item.lastEpisode, item.unread])).toEqual([
			[6, true],
			[5, false],
		]);
	});

	test("orders notifications of different series newest first", () => {
		const notifications = groupNotifications(
			[
				...released("s1", 5, 5, monday),
				...released("frieren", 3, 3, tuesday, {
					seriesId: "frieren",
				}),
			],
			new Map([
				["s1", baseline],
				["frieren", baseline],
			]),
			null,
		);

		expect(notifications.map((item) => item.seriesId)).toEqual(["frieren", "slime"]);
	});

	test("leaves out a notification the user deleted", () => {
		const notifications = groupNotifications(
			[...released("s1", 5, 5, monday), ...released("s1", 6, 6, tuesday)],
			new Map([["s1", baseline]]),
			null,
			new Set([`s1:${monday.getTime()}`]),
		);

		expect(notifications.map((item) => item.lastEpisode)).toEqual([6]);
	});

	test("gives a notification an ID that deleting it can name", () => {
		const [notification] = groupNotifications(
			released("s1", 5, 5, monday),
			new Map([["s1", baseline]]),
			null,
		);

		expect(notification?.id).toBe(`s1:${monday.getTime()}`);
	});

	test("lists nothing when nothing came out", () => {
		expect(groupNotifications([], new Map(), null)).toEqual([]);
	});
});
