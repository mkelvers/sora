import { attempt } from "@sora/shared";
import { z } from "zod";

import { UserAnimeListDocument, ViewerNameDocument } from "../../anilist/graphql.generated";
import type { UserAnimeListQuery } from "../../anilist/graphql.generated";
import { config } from "../../config";
import { InvalidInputError, UpstreamUnavailableError } from "../../errors";
import type { ImportAuthorization, ImportOptions } from "../../models/transfer";
import { aniListEntries, toMalEntry } from "./sources";
import type { ListEntry, MalEntry } from "./sources";

/** What a connected account's import needs: the one-time code the site returned, and what it was asked with. */
export type Authorization = ImportAuthorization;

type AccountSource = "anilist_account" | "myanimelist_account";

const requestTimeoutMs = 15_000;

const aniList = {
	api: "https://graphql.anilist.co",
	authorize: "https://anilist.co/api/v2/oauth/authorize",
	token: "https://anilist.co/api/v2/oauth/token",
};

const myAnimeList = {
	authorize: "https://myanimelist.net/v1/oauth2/authorize",
	list: "https://api.myanimelist.net/v2/users/@me/animelist?fields=list_status&limit=1000&nsfw=true",
	token: "https://myanimelist.net/v1/oauth2/token",
};

/** The most pages of a MyAnimeList list read, 1000 titles each, so a broken `next` cannot loop. */
const maxListPages = 20;

/** Which accounts people can connect on this Sora: those whose client is configured. */
export const importOptions = (clients: Clients = config): ImportOptions => ({
	anilist_account: clients.aniListOAuth !== null,
	myanimelist_account: clients.myAnimeListOAuth !== null,
});

const notSetUp = () => new InvalidInputError("Connecting that account is not set up on this Sora.");

const expired = (cause?: unknown) =>
	new InvalidInputError("The connection expired or was refused. Connect the account again.", {
		cause,
	});

/**
 * Where to send a person to connect an account. They come back to
 * `redirectUri` with `code` (and `state`, when the site returns it), which
 * an import then trades for access.
 *
 * MyAnimeList needs a `codeChallenge` and only accepts the plain method, so
 * the challenge is the code verifier itself.
 *
 * @throws {InvalidInputError} when that account is not set up on this Sora.
 */
export const authorizationUrl = (
	source: AccountSource,
	options: {
		redirectUri: string;
		state: string;
		codeChallenge: string;
	},
	clients: Clients = config,
): string => {
	if (source === "anilist_account") {
		if (!clients.aniListOAuth) {
			throw notSetUp();
		}

		const url = new URL(aniList.authorize);
		url.searchParams.set("client_id", clients.aniListOAuth.clientId);
		url.searchParams.set("redirect_uri", options.redirectUri);
		url.searchParams.set("response_type", "code");
		url.searchParams.set("state", options.state);
		return url.toString();
	}

	if (!clients.myAnimeListOAuth) {
		throw notSetUp();
	}

	const url = new URL(myAnimeList.authorize);
	url.searchParams.set("response_type", "code");
	url.searchParams.set("client_id", clients.myAnimeListOAuth.clientId);
	url.searchParams.set("redirect_uri", options.redirectUri);
	url.searchParams.set("state", options.state);
	url.searchParams.set("code_challenge", options.codeChallenge);
	url.searchParams.set("code_challenge_method", "plain");
	return url.toString();
};

/** The configured clients; tests pass their own. */
export interface Clients {
	aniListOAuth: { clientId: string; clientSecret: string } | null;
	myAnimeListOAuth: { clientId: string; clientSecret: string | null } | null;
}

/** What the account readers call out with; tests pass their own. */
export type Fetcher = (input: string, init?: RequestInit) => Promise<Response>;

const send = async (fetcher: Fetcher, url: string, init: RequestInit) => {
	const { data, error } = await attempt(
		fetcher(url, {
			...init,
			signal: AbortSignal.timeout(requestTimeoutMs),
		}),
		Error,
	);
	if (error) {
		throw new UpstreamUnavailableError("The site could not be reached.", {
			cause: error,
			retryAfterMs: null,
		});
	}

	return data;
};

const TokenSchema = z.object({
	access_token: z.string().min(1),
});

/** Trades a one-time code for an access token, which is used once and never kept. */
const accessToken = async (response: Response): Promise<string> => {
	if (response.status >= 500) {
		throw new UpstreamUnavailableError("The site could not be reached.", {
			retryAfterMs: null,
		});
	}
	if (!response.ok) {
		throw expired();
	}

	const token = TokenSchema.safeParse(await response.json());
	if (!token.success) {
		throw expired(token.error);
	}

	return token.data.access_token;
};

/**
 * An AniList user's whole list with their permission: public or private.
 *
 * @throws {InvalidInputError} when the code is expired or refused, or the account is not set up.
 * @throws {UpstreamUnavailableError} when AniList cannot be reached.
 */
export const readAniListAccount = async (
	authorization: Authorization,
	fetcher: Fetcher = fetch,
	clients: Clients = config,
): Promise<ListEntry[]> => {
	if (!clients.aniListOAuth) {
		throw notSetUp();
	}

	const token = await accessToken(
		await send(fetcher, aniList.token, {
			body: JSON.stringify({
				client_id: clients.aniListOAuth.clientId,
				client_secret: clients.aniListOAuth.clientSecret,
				code: authorization.code,
				grant_type: "authorization_code",
				redirect_uri: authorization.redirect_uri,
			}),
			headers: {
				Accept: "application/json",
				"Content-Type": "application/json",
			},
			method: "POST",
		}),
	);

	const query = async <T>(document: { toString: () => string }, variables: object) => {
		const response = await send(fetcher, aniList.api, {
			body: JSON.stringify({
				query: document.toString(),
				variables,
			}),
			headers: {
				Accept: "application/json",
				Authorization: `Bearer ${token}`,
				"Content-Type": "application/json",
			},
			method: "POST",
		});
		if (!response.ok) {
			throw new UpstreamUnavailableError("AniList could not be reached.", {
				retryAfterMs: null,
			});
		}

		return ((await response.json()) as { data?: T }).data;
	};

	const viewer = await query<{ Viewer: { name: string } | null }>(ViewerNameDocument, {});
	const name = viewer?.Viewer?.name;
	if (!name) {
		throw expired();
	}

	const list = await query<UserAnimeListQuery>(UserAnimeListDocument, {
		userName: name,
	});
	return aniListEntries(list?.MediaListCollection ?? null);
};

const MalPageSchema = z.object({
	data: z.array(
		z.object({
			list_status: z
				.object({
					num_episodes_watched: z.number().int().nonnegative().optional(),
					status: z.string(),
				})
				.optional(),
			node: z.object({
				id: z.number().int(),
				title: z.string().optional(),
			}),
		}),
	),
	paging: z
		.object({
			next: z.string().optional(),
		})
		.optional(),
});

/**
 * A MyAnimeList user's whole anime list with their permission. The
 * titles come with MyAnimeList IDs; see `fromMyAnimeList` for Sora's.
 *
 * @throws {InvalidInputError} when the code is expired or refused, or the account is not set up.
 * @throws {UpstreamUnavailableError} when MyAnimeList cannot be reached.
 */
export const readMyAnimeListAccount = async (
	authorization: Authorization,
	fetcher: Fetcher = fetch,
	clients: Clients = config,
): Promise<MalEntry[]> => {
	if (!clients.myAnimeListOAuth) {
		throw notSetUp();
	}

	const body = new URLSearchParams({
		client_id: clients.myAnimeListOAuth.clientId,
		code: authorization.code,
		code_verifier: authorization.code_verifier,
		grant_type: "authorization_code",
		redirect_uri: authorization.redirect_uri,
	});
	if (clients.myAnimeListOAuth.clientSecret) {
		body.set("client_secret", clients.myAnimeListOAuth.clientSecret);
	}

	const token = await accessToken(
		await send(fetcher, myAnimeList.token, {
			body,
			headers: {
				Accept: "application/json",
				"Content-Type": "application/x-www-form-urlencoded",
			},
			method: "POST",
		}),
	);

	const entries: MalEntry[] = [];
	const readPage = async (url: string, page: number): Promise<void> => {
		if (page >= maxListPages) {
			return;
		}

		const response = await send(fetcher, url, {
			headers: {
				Accept: "application/json",
				Authorization: `Bearer ${token}`,
			},
		});
		if (response.status === 401) {
			throw expired();
		}
		if (!response.ok) {
			throw new UpstreamUnavailableError("MyAnimeList could not be reached.", {
				retryAfterMs: null,
			});
		}

		const parsed = MalPageSchema.safeParse(await response.json());
		if (!parsed.success) {
			throw new UpstreamUnavailableError(
				"MyAnimeList answered in a way Sora does not understand.",
				{
					cause: parsed.error,
					retryAfterMs: null,
				},
			);
		}

		for (const item of parsed.data.data) {
			const status = item.list_status?.status;
			const entry = status
				? toMalEntry({
						malId: item.node.id,
						status,
						title: item.node.title ?? null,
						watched: item.list_status?.num_episodes_watched ?? 0,
					})
				: null;
			if (entry) {
				entries.push(entry);
			}
		}

		const next = parsed.data.paging?.next;
		if (next) {
			await readPage(next, page + 1);
		}
	};
	await readPage(myAnimeList.list, 0);

	return entries;
};
