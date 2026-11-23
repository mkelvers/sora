import { describe, expect, test } from "bun:test";

import type { Json } from "@sora/shared";

import { InvalidInputError, UpstreamUnavailableError } from "../../errors";
import { authorizationUrl, importOptions, readAnilistAccount, readMalAccount } from "./oauth";
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

/** A fake fetcher answering with `responses` in turn, and the calls it got. */
class Answering {
	readonly calls: Call[] = [];
	readonly #responses: Response[];

	constructor(...responses: Response[]) {
		this.#responses = responses;
	}

	readonly fetcher: Fetcher = (url, init) => {
		this.calls.push({
			init,
			url,
		});

		return Promise.resolve(
			this.#responses[this.calls.length - 1] ?? new Response("", { status: 500 }),
		);
	};
}

describe("importOptions", () => {
	test("offers only the accounts whose client is configured", () => {
		expect(importOptions(clients)).toEqual({
			anilist_account: true,
			myanimelist_account: true,
		});
		expect(importOptions(none)).toEqual({
			anilist_account: false,
			myanimelist_account: false,
		});
		expect(
			importOptions({
				...none,
				myAnimeListOAuth: clients.myAnimeListOAuth,
			}),
		).toEqual({
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

describe("readAnilistAccount", () => {
	const list: Json = {
		data: {
			MediaListCollection: {
				lists: [
					{
						entries: [
							{
								completedAt: null,
								createdAt: 1_617_970_746,
								media: { id: 1 },
								progress: 4,
								startedAt: null,
								status: "CURRENT",
								updatedAt: 1_622_412_501,
							},
							{
								completedAt: {
									day: 3,
									month: 2,
									year: 2020,
								},
								createdAt: 0,
								media: { id: 2 },
								progress: 12,
								startedAt: {
									day: null,
									month: null,
									year: 2020,
								},
								status: "COMPLETED",
								updatedAt: 0,
							},
							{
								completedAt: null,
								createdAt: 0,
								media: { id: 3 },
								progress: 0,
								startedAt: null,
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
		const { calls, fetcher } = new Answering(
			Response.json({ access_token: "tok" }),
			Response.json({ data: { Viewer: { name: "someone" } } }),
			Response.json(list),
		);

		const { account, entries } = await readAnilistAccount(authorization, fetcher, clients);

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

	test("rejects account responses whose selected fields have the wrong types", async () => {
		const { fetcher } = new Answering(
			Response.json({ access_token: "tok" }),
			Response.json({ data: { Viewer: { name: 123 } } }),
		);

		await expect(readAnilistAccount(authorization, fetcher, clients)).rejects.toBeInstanceOf(
			UpstreamUnavailableError,
		);
	});

	test("says the connection expired when AniList refuses the code", async () => {
		const { fetcher } = new Answering(Response.json({ error: "invalid_grant" }, { status: 400 }));

		await expect(readAnilistAccount(authorization, fetcher, clients)).rejects.toBeInstanceOf(
			InvalidInputError,
		);
	});

	test("says AniList is unreachable when it fails or cannot be reached", async () => {
		const down = new Answering(new Response("", { status: 503 }));
		await expect(readAnilistAccount(authorization, down.fetcher, clients)).rejects.toBeInstanceOf(
			UpstreamUnavailableError,
		);

		await expect(
			readAnilistAccount(authorization, () => Promise.reject(new Error("offline")), clients),
		).rejects.toBeInstanceOf(UpstreamUnavailableError);
	});

	test("does nothing when AniList is not set up", async () => {
		await expect(readAnilistAccount(authorization, fetch, none)).rejects.toBeInstanceOf(
			InvalidInputError,
		);
	});
});

describe("readMalAccount", () => {
	test("trades the code with the verifier, then reads every page", async () => {
		const { calls, fetcher } = new Answering(
			Response.json({ access_token: "tok" }),
			Response.json({ name: "someone" }),
			Response.json({
				data: [
					{
						list_status: {
							num_episodes_watched: 3,
							status: "watching",
						},
						node: {
							id: 10,
							title: "Title 10",
						},
					},
					{
						list_status: {
							num_episodes_watched: 5,
							status: "on_hold",
						},
						node: {
							id: 11,
							title: "Title 11",
						},
					},
				],
				paging: { next: "https://api.myanimelist.net/v2/users/@me/animelist?offset=1000" },
			}),
			Response.json({
				data: [
					{
						list_status: {
							finish_date: "2020-05",
							num_episodes_watched: 24,
							start_date: "2020-04-02",
							status: "completed",
							updated_at: "2020-06-01T10:00:00+00:00",
						},
						node: {
							id: 12,
							title: "Title 12",
						},
					},
					{
						list_status: {
							num_episodes_watched: 0,
							status: "plan_to_watch",
						},
						node: {
							id: 13,
							title: "Title 13",
						},
					},
				],
			}),
		);

		const { account, entries } = await readMalAccount(authorization, fetcher, clients);

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
		const { calls, fetcher } = new Answering(
			Response.json({ access_token: "tok" }),
			Response.json({ name: "someone" }),
			Response.json({ data: [] }),
		);

		await readMalAccount(authorization, fetcher, {
			...clients,
			myAnimeListOAuth: {
				clientId: "mal-id",
				clientSecret: null,
			},
		});

		expect(new URLSearchParams(String(calls[0]?.init?.body)).has("client_secret")).toBe(false);
	});

	test("says the connection expired when the token is refused or no longer valid", async () => {
		const refused = new Answering(Response.json({ error: "invalid_grant" }, { status: 400 }));
		await expect(readMalAccount(authorization, refused.fetcher, clients)).rejects.toBeInstanceOf(
			InvalidInputError,
		);

		const invalid = new Answering(
			Response.json({ access_token: "tok" }),
			Response.json({ name: "someone" }),
			new Response("", { status: 401 }),
		);

		await expect(readMalAccount(authorization, invalid.fetcher, clients)).rejects.toBeInstanceOf(
			InvalidInputError,
		);
	});

	test("stops at an answer it does not understand", async () => {
		const { fetcher } = new Answering(
			Response.json({ access_token: "tok" }),
			Response.json({ name: "someone" }),
			Response.json({ unexpected: true }),
		);

		await expect(readMalAccount(authorization, fetcher, clients)).rejects.toBeInstanceOf(
			UpstreamUnavailableError,
		);
	});
});
