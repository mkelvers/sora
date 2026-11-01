import { describe, expect, test } from "bun:test";

import { InvalidInputError, UpstreamUnavailableError } from "../../errors";
import {
	authorizationUrl,
	importOptions,
	readAniListAccount,
	readMyAnimeListAccount,
} from "./oauth";
import type { Clients, Fetcher } from "./oauth";

const clients: Clients = {
	aniListOAuth: {
		clientId: "al-id",
		clientSecret: "al-secret",
	},
	myAnimeListOAuth: {
		clientId: "mal-id",
		clientSecret: "mal-secret",
	},
};
const none: Clients = {
	aniListOAuth: null,
	myAnimeListOAuth: null,
};
const authorization = {
	code: "the-code",
	code_verifier: "v".repeat(64),
	redirect_uri: "https://sora.example/settings/library",
};

interface Call {
	url: string;
	init: RequestInit | undefined;
}

/** A fetcher that answers each call in turn and records what it was sent. */
const answering = (...responses: Response[]): { calls: Call[]; fetcher: Fetcher } => {
	const calls: Call[] = [];
	return {
		calls,
		fetcher: (url, init) => {
			calls.push({ init, url });
			return Promise.resolve(responses[calls.length - 1] ?? new Response("", { status: 500 }));
		},
	};
};

const json = (body: unknown, status = 200) => Response.json(body, { status });

const unreachable: Fetcher = () => Promise.reject(new Error("offline"));

const item = (
	id: number,
	status: string,
	watched: number,
	dates: { start_date?: string; finish_date?: string; updated_at?: string } = {},
) => ({
	list_status: { num_episodes_watched: watched, status, ...dates },
	node: { id, title: `Title ${id}` },
});

describe("importOptions", () => {
	test("offers only the accounts whose client is configured", () => {
		expect(importOptions(clients)).toEqual({ anilist_account: true, myanimelist_account: true });
		expect(importOptions(none)).toEqual({ anilist_account: false, myanimelist_account: false });
		expect(importOptions({ ...none, myAnimeListOAuth: clients.myAnimeListOAuth })).toEqual({
			anilist_account: false,
			myanimelist_account: true,
		});
	});
});

describe("authorizationUrl", () => {
	const options = {
		codeChallenge: "c".repeat(64),
		redirectUri: authorization.redirect_uri,
		state: "state-12345678",
	};

	test("sends AniList the client, the way back, and the state", () => {
		const url = new URL(authorizationUrl("anilist_account", options, clients));

		expect(url.origin + url.pathname).toBe("https://anilist.co/api/v2/oauth/authorize");
		expect(Object.fromEntries(url.searchParams)).toEqual({
			client_id: "al-id",
			redirect_uri: authorization.redirect_uri,
			response_type: "code",
			state: "state-12345678",
		});
	});

	test("sends MyAnimeList a plain PKCE challenge", () => {
		const url = new URL(authorizationUrl("myanimelist_account", options, clients));

		expect(url.origin + url.pathname).toBe("https://myanimelist.net/v1/oauth2/authorize");
		expect(url.searchParams.get("code_challenge")).toBe("c".repeat(64));
		expect(url.searchParams.get("code_challenge_method")).toBe("plain");
		expect(url.searchParams.get("client_id")).toBe("mal-id");
	});

	test("refuses an account that is not set up", () => {
		expect(() => authorizationUrl("anilist_account", options, none)).toThrow(InvalidInputError);
		expect(() => authorizationUrl("myanimelist_account", options, none)).toThrow(InvalidInputError);
	});
});

describe("readAniListAccount", () => {
	const list = {
		data: {
			MediaListCollection: {
				lists: [
					{
						entries: [
							{
								createdAt: 1_617_970_746,
								media: { id: 1 },
								progress: 4,
								status: "CURRENT",
								updatedAt: 1_622_412_501,
							},
							{
								completedAt: { day: 3, month: 2, year: 2020 },
								createdAt: 0,
								media: { id: 2 },
								progress: 12,
								startedAt: { day: null, month: null, year: 2020 },
								status: "COMPLETED",
								updatedAt: 0,
							},
							{
								createdAt: 0,
								media: { id: 3 },
								progress: 0,
								status: "PLANNING",
								updatedAt: 0,
							},
						],
					},
				],
			},
		},
	};

	test("trades the code, then reads the list of the person it belongs to", async () => {
		const { calls, fetcher } = answering(
			json({ access_token: "tok" }),
			json({ data: { Viewer: { name: "someone" } } }),
			json(list),
		);

		const { account, entries } = await readAniListAccount(authorization, fetcher, clients);

		expect(account).toBe("someone");

		expect(entries).toEqual([
			{
				addedAt: new Date("2021-04-09T12:19:06Z"),
				anilistId: 1,
				changedAt: new Date("2021-05-30T22:08:21Z"),
				status: "watching",
				through: 4,
				title: null,
			},
			{
				addedAt: new Date("2020-01-01T00:00:00Z"),
				anilistId: 2,
				changedAt: new Date("2020-02-03T00:00:00Z"),
				status: "completed",
				through: null,
				title: null,
			},
			{
				addedAt: null,
				anilistId: 3,
				changedAt: null,
				status: "plan_to_watch",
				through: 0,
				title: null,
			},
		]);
		expect(calls[0]?.url).toBe("https://anilist.co/api/v2/oauth/token");
		expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({
			client_id: "al-id",
			client_secret: "al-secret",
			code: "the-code",
			grant_type: "authorization_code",
			redirect_uri: authorization.redirect_uri,
		});
		expect(new Headers(calls[1]?.init?.headers).get("Authorization")).toBe("Bearer tok");
		expect(JSON.parse(String(calls[2]?.init?.body)).variables).toEqual({ userName: "someone" });
	});

	test("says the connection expired when AniList refuses the code", async () => {
		const { fetcher } = answering(json({ error: "invalid_grant" }, 400));

		await expect(readAniListAccount(authorization, fetcher, clients)).rejects.toBeInstanceOf(
			InvalidInputError,
		);
	});

	test("says AniList is unreachable when it fails or cannot be reached", async () => {
		const down = answering(new Response("", { status: 503 }));
		await expect(readAniListAccount(authorization, down.fetcher, clients)).rejects.toBeInstanceOf(
			UpstreamUnavailableError,
		);

		await expect(readAniListAccount(authorization, unreachable, clients)).rejects.toBeInstanceOf(
			UpstreamUnavailableError,
		);
	});

	test("does nothing when AniList is not set up", async () => {
		await expect(readAniListAccount(authorization, fetch, none)).rejects.toBeInstanceOf(
			InvalidInputError,
		);
	});
});

describe("readMyAnimeListAccount", () => {
	test("trades the code with the verifier, then reads every page", async () => {
		const { calls, fetcher } = answering(
			json({ access_token: "tok" }),
			json({ name: "someone" }),
			json({
				data: [item(10, "watching", 3), item(11, "on_hold", 5)],
				paging: { next: "https://api.myanimelist.net/v2/users/@me/animelist?offset=1000" },
			}),
			json({
				data: [
					item(12, "completed", 24, {
						finish_date: "2020-05",
						start_date: "2020-04-02",
						updated_at: "2020-06-01T10:00:00+00:00",
					}),
					item(13, "plan_to_watch", 0),
				],
			}),
		);

		const { account, entries } = await readMyAnimeListAccount(authorization, fetcher, clients);

		expect(account).toBe("someone");

		expect(entries.map((entry) => [entry.malId, entry.status, entry.through])).toEqual([
			[10, "watching", 3],
			[11, "watching", 5],
			[12, "completed", null],
			[13, "plan_to_watch", 0],
		]);
		expect(entries[2]?.addedAt).toEqual(new Date("2020-04-02T00:00:00Z"));
		expect(entries[2]?.changedAt).toEqual(new Date("2020-06-01T10:00:00Z"));
		expect(entries[3]?.addedAt).toBeNull();
		expect(entries[3]?.changedAt).toBeNull();
		const form = new URLSearchParams(String(calls[0]?.init?.body));
		expect(Object.fromEntries(form)).toEqual({
			client_id: "mal-id",
			client_secret: "mal-secret",
			code: "the-code",
			code_verifier: "v".repeat(64),
			grant_type: "authorization_code",
			redirect_uri: authorization.redirect_uri,
		});
		expect(calls).toHaveLength(4);
		expect(new Headers(calls[1]?.init?.headers).get("Authorization")).toBe("Bearer tok");
		expect(calls[3]?.url).toContain("offset=1000");
	});

	test("leaves the secret out when the client has none", async () => {
		const { calls, fetcher } = answering(
			json({ access_token: "tok" }),
			json({ name: "someone" }),
			json({ data: [] }),
		);

		await readMyAnimeListAccount(authorization, fetcher, {
			...clients,
			myAnimeListOAuth: { clientId: "mal-id", clientSecret: null },
		});

		expect(new URLSearchParams(String(calls[0]?.init?.body)).has("client_secret")).toBe(false);
	});

	test("says the connection expired when the token is refused or no longer valid", async () => {
		const refused = answering(json({ error: "invalid_grant" }, 400));
		await expect(
			readMyAnimeListAccount(authorization, refused.fetcher, clients),
		).rejects.toBeInstanceOf(InvalidInputError);

		const invalid = answering(
			json({ access_token: "tok" }),
			json({ name: "someone" }),
			new Response("", { status: 401 }),
		);
		await expect(
			readMyAnimeListAccount(authorization, invalid.fetcher, clients),
		).rejects.toBeInstanceOf(InvalidInputError);
	});

	test("stops at an answer it does not understand", async () => {
		const { fetcher } = answering(
			json({ access_token: "tok" }),
			json({ name: "someone" }),
			json({ unexpected: true }),
		);

		await expect(readMyAnimeListAccount(authorization, fetcher, clients)).rejects.toBeInstanceOf(
			UpstreamUnavailableError,
		);
	});
});
