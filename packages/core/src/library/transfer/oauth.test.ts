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

const item = (id: number, status: string, watched: number) => ({
	list_status: { num_episodes_watched: watched, status },
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
							{ media: { id: 1 }, progress: 4, status: "CURRENT" },
							{ media: { id: 2 }, progress: 12, status: "COMPLETED" },
							{ media: { id: 3 }, progress: 0, status: "PLANNING" },
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

		const entries = await readAniListAccount(authorization, fetcher, clients);

		expect(entries).toEqual([
			{ anilistId: 1, status: "watching", through: 4, title: null },
			{ anilistId: 2, status: "completed", through: null, title: null },
			{ anilistId: 3, status: "plan_to_watch", through: 0, title: null },
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
			json({
				data: [item(10, "watching", 3), item(11, "on_hold", 5)],
				paging: { next: "https://api.myanimelist.net/v2/users/@me/animelist?offset=1000" },
			}),
			json({ data: [item(12, "completed", 24), item(13, "plan_to_watch", 0)] }),
		);

		const entries = await readMyAnimeListAccount(authorization, fetcher, clients);

		expect(entries.map((entry) => [entry.malId, entry.status, entry.through])).toEqual([
			[10, "watching", 3],
			[11, "watching", 5],
			[12, "completed", null],
			[13, "plan_to_watch", 0],
		]);
		const form = new URLSearchParams(String(calls[0]?.init?.body));
		expect(Object.fromEntries(form)).toEqual({
			client_id: "mal-id",
			client_secret: "mal-secret",
			code: "the-code",
			code_verifier: "v".repeat(64),
			grant_type: "authorization_code",
			redirect_uri: authorization.redirect_uri,
		});
		expect(calls).toHaveLength(3);
		expect(new Headers(calls[1]?.init?.headers).get("Authorization")).toBe("Bearer tok");
		expect(calls[2]?.url).toContain("offset=1000");
	});

	test("leaves the secret out when the client has none", async () => {
		const { calls, fetcher } = answering(json({ access_token: "tok" }), json({ data: [] }));

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

		const invalid = answering(json({ access_token: "tok" }), new Response("", { status: 401 }));
		await expect(
			readMyAnimeListAccount(authorization, invalid.fetcher, clients),
		).rejects.toBeInstanceOf(InvalidInputError);
	});

	test("stops at an answer it does not understand", async () => {
		const { fetcher } = answering(json({ access_token: "tok" }), json({ unexpected: true }));

		await expect(readMyAnimeListAccount(authorization, fetcher, clients)).rejects.toBeInstanceOf(
			UpstreamUnavailableError,
		);
	});
});
