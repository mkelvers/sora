import { attempt } from "@sora/shared";
import { z } from "zod";

import { UserAnimeListDocument, ViewerNameDocument } from "../../anilist/graphql.generated";
import type { TypedDocumentString } from "../../anilist/graphql.generated";
import { zUserAnimeListQuery, zViewerNameQuery } from "../../anilist/validation.generated";
import { config } from "../../config";
import { InvalidInputError, UpstreamUnavailableError } from "../../errors";
import type { ImportAuthorization, ImportOptions } from "../../models/transfer";
import { aniListEntries, toMalEntry } from "./sources";
import type { ListEntry, MalEntry } from "./sources";

/** What a connected account's import needs: the one-time code the site returned, and what it was asked with. */
export type Authorization = ImportAuthorization;

type AccountSource = "anilist_account" | "myanimelist_account";

const anilist = {
	api: "https://graphql.anilist.co",
	authorize: "https://anilist.co/api/v2/oauth/authorize",
	token: "https://anilist.co/api/v2/oauth/token",
};

const mal = {
	authorize: "https://myanimelist.net/v1/oauth2/authorize",
	list: "https://api.myanimelist.net/v2/users/@me/animelist?fields=list_status&limit=1000&nsfw=true",
	token: "https://myanimelist.net/v1/oauth2/token",
	user: "https://api.myanimelist.net/v2/users/@me",
};

/** A site an account is connected on, called out to with a {@link Fetcher}. */
class Site {
	static readonly #tokenSchema = z.object({
		access_token: z.string().min(1),
	});

	readonly #fetcher: Fetcher;

	constructor(fetcher: Fetcher) {
		this.#fetcher = fetcher;
	}

	/** The error for an account kind that is not set up on this Sora. */
	static notSetUp() {
		return new InvalidInputError("Connecting that account is not set up on this Sora.");
	}

	/** The error for a connection that expired or was refused. */
	static expired(cause?: unknown) {
		return new InvalidInputError(
			"The connection expired or was refused. Connect the account again.",
			{
				cause,
			},
		);
	}

	/**
	 * Calls the site, giving up after 15 seconds.
	 *
	 * @throws {UpstreamUnavailableError} when the site cannot be reached.
	 */
	async send(url: string, init: RequestInit): Promise<Response> {
		const { data, error } = await attempt(
			this.#fetcher(url, {
				...init,
				signal: AbortSignal.timeout(15_000),
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
	}

	/** Trades a one-time code for an access token, which is used once and never kept. */
	async token(url: string, init: RequestInit): Promise<string> {
		const response = await this.send(url, init);

		if (response.status >= 500) {
			throw new UpstreamUnavailableError("The site could not be reached.", {
				retryAfterMs: null,
			});
		}

		if (!response.ok) {
			throw Site.expired();
		}

		const token = Site.#tokenSchema.safeParse(await response.json());

		if (!token.success) {
			throw Site.expired(token.error);
		}

		return token.data.access_token;
	}
}

/** Which accounts people can connect on this Sora: those whose client is configured. */
export const importOptions = (clients: Clients = config): ImportOptions => ({
	anilist_account: clients.aniListOAuth !== null,
	myanimelist_account: clients.myAnimeListOAuth !== null,
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
			throw Site.notSetUp();
		}

		const url = new URL(anilist.authorize);
		url.searchParams.set("client_id", clients.aniListOAuth.clientId);
		url.searchParams.set("redirect_uri", options.redirectUri);
		url.searchParams.set("response_type", "code");
		url.searchParams.set("state", options.state);

		return url.toString();
	}

	if (!clients.myAnimeListOAuth) {
		throw Site.notSetUp();
	}

	const url = new URL(mal.authorize);
	url.searchParams.set("response_type", "code");
	url.searchParams.set("client_id", clients.myAnimeListOAuth.clientId);
	url.searchParams.set("redirect_uri", options.redirectUri);
	url.searchParams.set("state", options.state);
	url.searchParams.set("code_challenge", options.codeChallenge);
	url.searchParams.set("code_challenge_method", "plain");

	return url.toString();
};

/** A connected account's list, and the name it goes by on the site. */
export interface AccountEntries<Entry> {
	account: string;
	entries: Entry[];
}

/** The configured clients; tests pass their own. */
export interface Clients {
	aniListOAuth: {
		clientId: string;
		clientSecret: string;
	} | null;
	myAnimeListOAuth: {
		clientId: string;
		clientSecret: string | null;
	} | null;
}

/** What the account readers call out with; tests pass their own. */
export type Fetcher = (input: string, init?: RequestInit) => Promise<Response>;

/**
 * An AniList user's whole list with their permission: public or private.
 *
 * @throws {InvalidInputError} when the code is expired or refused, or the account is not set up.
 * @throws {UpstreamUnavailableError} when AniList cannot be reached.
 */
export const readAnilistAccount = async (
	authorization: Authorization,
	fetcher: Fetcher = fetch,
	clients: Clients = config,
): Promise<AccountEntries<ListEntry>> => {
	if (!clients.aniListOAuth) {
		throw Site.notSetUp();
	}

	const site = new Site(fetcher);

	const token = await site.token(anilist.token, {
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
	});

	const query = async <TResult, TVariables>(
		document: TypedDocumentString<TResult, TVariables>,
		variables: TVariables,
		schema: z.ZodType<NoInfer<TResult>>,
	) => {
		const response = await site.send(anilist.api, {
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

		const json = await attempt(response.json());

		if (json.error) {
			throw new UpstreamUnavailableError("AniList returned a response that is not JSON", {
				cause: json.error,
				retryAfterMs: null,
			});
		}

		const parsed = z.object({ data: schema.optional() }).safeParse(json.data);

		if (!parsed.success) {
			throw new UpstreamUnavailableError("AniList returned an invalid account response", {
				cause: parsed.error,
				retryAfterMs: null,
			});
		}

		return parsed.data.data;
	};

	const viewer = await query(ViewerNameDocument, {}, zViewerNameQuery);
	const name = viewer?.Viewer?.name;

	if (!name) {
		throw Site.expired();
	}

	const list = await query(
		UserAnimeListDocument,
		{
			userName: name,
		},
		zUserAnimeListQuery,
	);

	return {
		account: name,
		entries: aniListEntries(list?.MediaListCollection ?? null),
	};
};

/**
 * A MyAnimeList user's whole anime list with their permission. The
 * titles come with MyAnimeList IDs; see `fromMal` for Sora's.
 *
 * @throws {InvalidInputError} when the code is expired or refused, or the account is not set up.
 * @throws {UpstreamUnavailableError} when MyAnimeList cannot be reached.
 */
export const readMalAccount = async (
	authorization: Authorization,
	fetcher: Fetcher = fetch,
	clients: Clients = config,
): Promise<AccountEntries<MalEntry>> => {
	/** The most pages of a MyAnimeList list read, 1000 titles each, so a broken `next` cannot loop. */
	const maxListPages = 20;

	if (!clients.myAnimeListOAuth) {
		throw Site.notSetUp();
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

	const site = new Site(fetcher);

	const token = await site.token(mal.token, {
		body,
		headers: {
			Accept: "application/json",
			"Content-Type": "application/x-www-form-urlencoded",
		},
		method: "POST",
	});

	const headers = {
		Accept: "application/json",
		Authorization: `Bearer ${token}`,
	};

	const me = await site.send(mal.user, {
		headers,
	});

	if (me.status === 401) {
		throw Site.expired();
	}

	if (!me.ok) {
		throw new UpstreamUnavailableError("MyAnimeList could not be reached.", {
			retryAfterMs: null,
		});
	}

	const user = z
		.object({
			name: z.string().min(1),
		})
		.safeParse(await me.json());

	if (!user.success) {
		throw Site.expired(user.error);
	}

	const MalPageSchema = z.object({
		data: z.array(
			z.object({
				list_status: z
					.object({
						finish_date: z.string().nullish(),
						num_episodes_watched: z.number().int().nonnegative().optional(),
						start_date: z.string().nullish(),
						status: z.string(),
						updated_at: z.string().nullish(),
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

	const entries: MalEntry[] = [];

	const readPage = async (url: string, page: number): Promise<void> => {
		if (page >= maxListPages) {
			return;
		}

		const response = await site.send(url, {
			headers,
		});

		if (response.status === 401) {
			throw Site.expired();
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

			if (!status) {
				continue;
			}

			const entry = toMalEntry({
				finished: item.list_status?.finish_date,
				malId: item.node.id,
				started: item.list_status?.start_date,
				status,
				title: item.node.title ?? null,
				updated: item.list_status?.updated_at,
				watched: item.list_status?.num_episodes_watched ?? 0,
			});

			if (entry) {
				entries.push(entry);
			}
		}

		const next = parsed.data.paging?.next;

		if (next) {
			await readPage(next, page + 1);
		}
	};

	await readPage(mal.list, 0);

	return {
		account: user.data.name,
		entries,
	};
};
