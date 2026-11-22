import { describe, expect, test } from "bun:test";

import { franchiseRoles } from "./roles";
import type { RoleRelation, RoleTitle } from "./roles";

/** A title of a franchise, with `overrides` changed from an ordinary one-episode TV title. */
class Fixture {
	readonly #anilistId: number;
	readonly #format: RoleTitle["format"];
	readonly #overrides: Partial<RoleTitle>;

	constructor(anilistId: number, format: RoleTitle["format"], overrides: Partial<RoleTitle> = {}) {
		this.#anilistId = anilistId;
		this.#format = format;
		this.#overrides = overrides;
	}

	get title() {
		return {
			anilistId: this.#anilistId,
			durationMinutes: 24,
			episodeCount: 1,
			format: this.#format,
			popularity: 5000,
			score: 70,
			...this.#overrides,
		} satisfies RoleTitle;
	}
}

describe("franchiseRoles", () => {
	const indigo = new Fixture(1, "TV", { episodeCount: 82 }).title;
	const johto = new Fixture(2, "TV", { episodeCount: 52 }).title;
	const main = new Set([1, 2]);

	test("keeps the main path as seasons", () => {
		const roles = franchiseRoles([indigo, johto], [], main);
		expect(roles.get(1)).toBe("season");
		expect(roles.get(2)).toBe("season");
	});

	test("lists side-story films and specials as extras when they are worth watching", () => {
		const film = new Fixture(10, "MOVIE", { durationMinutes: 75 }).title;

		const special = new Fixture(11, "SPECIAL", {
			popularity: 100,
			score: 62,
		}).title;

		const roles = franchiseRoles(
			[indigo, film, special],
			[
				{
					from: 1,
					to: 10,
					type: "SIDE_STORY",
				},
				{
					from: 11,
					to: 1,
					type: "PARENT",
				},
			],
			main,
		);

		expect(roles.get(10)).toBe("extra");
		expect(roles.get(11)).toBe("extra");
	});

	test("keeps a sequel film however little it is rated, but not a side-story promo", () => {
		const sequel = new Fixture(12, "MOVIE", {
			popularity: 300,
			score: 45,
		}).title;

		const promo = new Fixture(13, "SPECIAL", {
			popularity: 1800,
			score: 56,
		}).title;

		const roles = franchiseRoles(
			[indigo, sequel, promo],
			[
				{
					from: 1,
					to: 12,
					type: "SEQUEL",
				},
				{
					from: 1,
					to: 13,
					type: "SIDE_STORY",
				},
			],
			main,
		);

		expect(roles.get(12)).toBe("extra");
		expect(roles.get(13)).toBe("noise");
	});

	test("separates spin-offs and character crossovers", () => {
		const spinOff = new Fixture(20, "TV", { episodeCount: 12 }).title;

		const roles = franchiseRoles(
			[indigo, spinOff],
			[
				{
					from: 1,
					to: 20,
					type: "SPIN_OFF",
				},
			],
			main,
		);

		expect(roles.get(20)).toBe("spin_off");
	});

	test("hides recaps and compilations, whatever their other links", () => {
		const recap = new Fixture(30, "SPECIAL").title;

		const roles = franchiseRoles(
			[indigo, recap],
			[
				{
					from: 1,
					to: 30,
					type: "SUMMARY",
				},
				{
					from: 1,
					to: 30,
					type: "SIDE_STORY",
				},
			],
			main,
		);

		expect(roles.get(30)).toBe("recap");
	});

	test("sets another adaptation of the main story apart", () => {
		const remake = new Fixture(40, "MOVIE", { durationMinutes: 97 }).title;

		const roles = franchiseRoles(
			[indigo, remake],
			[
				{
					from: 1,
					to: 40,
					type: "ALTERNATIVE",
				},
			],
			main,
		);

		expect(roles.get(40)).toBe("alternative");
	});

	test("drops music and clips that nothing connects", () => {
		const roles = franchiseRoles(
			[
				indigo,
				new Fixture(50, "MUSIC", { popularity: 90_000 }).title,
				new Fixture(51, "ONA", {
					durationMinutes: 2,
					popularity: 90_000,
				}).title,
			],
			[],
			main,
		);

		expect(roles.get(50)).toBe("noise");
		expect(roles.get(51)).toBe("noise");
	});

	test("keeps an unconnected short with a real runtime that people watch", () => {
		const fun = new Fixture(60, "OVA", {
			durationMinutes: 8,
			episodeCount: 3,
			score: 74,
		}).title;

		const forgotten = new Fixture(61, "OVA", {
			durationMinutes: 8,
			episodeCount: 3,
			popularity: 120,
			score: 41,
		}).title;

		const roles = franchiseRoles([indigo, fun, forgotten], [], main);
		expect(roles.get(60)).toBe("extra");
		expect(roles.get(61)).toBe("noise");
	});

	test("does not hold an unknown runtime against a title", () => {
		const roles = franchiseRoles(
			[indigo, new Fixture(70, "OVA", { durationMinutes: null }).title],
			[],
			main,
		);

		expect(roles.get(70)).toBe("extra");
	});

	test("reads relations in either direction", () => {
		const relations: RoleRelation[] = [
			{
				from: 80,
				to: 2,
				type: "SEQUEL",
			},
		];

		const roles = franchiseRoles([johto, new Fixture(80, "MOVIE").title], relations, main);
		expect(roles.get(80)).toBe("extra");
	});

	test("keeps a spin-off that lists its original as its parent", () => {
		const roles = franchiseRoles(
			[indigo, new Fixture(90, "TV", { episodeCount: 13 }).title],
			[
				{
					from: 1,
					to: 90,
					type: "SPIN_OFF",
				},
				{
					from: 90,
					to: 1,
					type: "PARENT",
				},
			],
			main,
		);

		expect(roles.get(90)).toBe("spin_off");
	});
});
