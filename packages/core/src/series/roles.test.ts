import { describe, expect, test } from "bun:test";

import { franchiseRoles, type RoleRelation, type RoleTitle } from "./roles";

function title(anilistId: number, format: RoleTitle["format"], overrides: Partial<RoleTitle> = {}) {
	return {
		anilistId,
		format,
		episodeCount: 1,
		durationMinutes: 24,
		score: 70,
		popularity: 5000,
		...overrides,
	} satisfies RoleTitle;
}

describe("franchiseRoles", () => {
	const indigo = title(1, "TV", { episodeCount: 82 });
	const johto = title(2, "TV", { episodeCount: 52 });
	const main = new Set([1, 2]);

	test("keeps the main path as seasons", () => {
		const roles = franchiseRoles([indigo, johto], [], main);
		expect(roles.get(1)).toBe("season");
		expect(roles.get(2)).toBe("season");
	});

	test("lists side-story films and specials as extras when they are worth watching", () => {
		const film = title(10, "MOVIE", { durationMinutes: 75 });
		const special = title(11, "SPECIAL", { score: 62, popularity: 100 });
		const roles = franchiseRoles(
			[indigo, film, special],
			[
				{ from: 1, to: 10, type: "SIDE_STORY" },
				{ from: 11, to: 1, type: "PARENT" },
			],
			main,
		);
		expect(roles.get(10)).toBe("extra");
		expect(roles.get(11)).toBe("extra");
	});

	test("keeps a sequel film however little it is rated, but not a side-story promo", () => {
		const sequel = title(12, "MOVIE", { score: 45, popularity: 300 });
		const promo = title(13, "SPECIAL", { score: 56, popularity: 1800 });
		const roles = franchiseRoles(
			[indigo, sequel, promo],
			[
				{ from: 1, to: 12, type: "SEQUEL" },
				{ from: 1, to: 13, type: "SIDE_STORY" },
			],
			main,
		);
		expect(roles.get(12)).toBe("extra");
		expect(roles.get(13)).toBe("noise");
	});

	test("separates spin-offs and character crossovers", () => {
		const spinOff = title(20, "TV", { episodeCount: 12 });
		const roles = franchiseRoles([indigo, spinOff], [{ from: 1, to: 20, type: "SPIN_OFF" }], main);
		expect(roles.get(20)).toBe("spin_off");
	});

	test("hides recaps and compilations, whatever their other links", () => {
		const recap = title(30, "SPECIAL");
		const roles = franchiseRoles(
			[indigo, recap],
			[
				{ from: 1, to: 30, type: "SUMMARY" },
				{ from: 1, to: 30, type: "SIDE_STORY" },
			],
			main,
		);
		expect(roles.get(30)).toBe("recap");
	});

	test("sets another adaptation of the main story apart", () => {
		const remake = title(40, "MOVIE", { durationMinutes: 97 });
		const roles = franchiseRoles(
			[indigo, remake],
			[{ from: 1, to: 40, type: "ALTERNATIVE" }],
			main,
		);
		expect(roles.get(40)).toBe("alternative");
	});

	test("drops music and clips that nothing connects", () => {
		const roles = franchiseRoles(
			[
				indigo,
				title(50, "MUSIC", { popularity: 90000 }),
				title(51, "ONA", { durationMinutes: 2, popularity: 90000 }),
			],
			[],
			main,
		);
		expect(roles.get(50)).toBe("noise");
		expect(roles.get(51)).toBe("noise");
	});

	test("keeps an unconnected short with a real runtime that people watch", () => {
		const fun = title(60, "OVA", { episodeCount: 3, durationMinutes: 8, score: 74 });
		const forgotten = title(61, "OVA", {
			episodeCount: 3,
			durationMinutes: 8,
			score: 41,
			popularity: 120,
		});
		const roles = franchiseRoles([indigo, fun, forgotten], [], main);
		expect(roles.get(60)).toBe("extra");
		expect(roles.get(61)).toBe("noise");
	});

	test("does not hold an unknown runtime against a title", () => {
		const roles = franchiseRoles([indigo, title(70, "OVA", { durationMinutes: null })], [], main);
		expect(roles.get(70)).toBe("extra");
	});

	test("reads relations in either direction", () => {
		const relations: RoleRelation[] = [{ from: 80, to: 2, type: "SEQUEL" }];
		const roles = franchiseRoles([johto, title(80, "MOVIE")], relations, main);
		expect(roles.get(80)).toBe("extra");
	});
});
