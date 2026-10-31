import { browser } from "$app/env";
import { attempt } from "@sora/shared";

export type AccountSource = "anilist_account" | "myanimelist_account";

/** What the browser remembers while the person is away agreeing on the other site. */
interface Pending {
	source: AccountSource;
	state: string;
	verifier: string;
}

const storageKey = "sora:import-connection";

const random = (bytes: number) =>
	[...crypto.getRandomValues(new Uint8Array(bytes))]
		.map((byte) => byte.toString(16).padStart(2, "0"))
		.join("");

const read = (): Pending | null => {
	if (!browser) {
		return null;
	}

	const { data } = attempt(
		() => JSON.parse(sessionStorage.getItem(storageKey) ?? "null") as Pending | null,
		DOMException,
		SyntaxError,
	);
	return data;
};

const forget = () => {
	attempt(() => sessionStorage.removeItem(storageKey), DOMException);
};

/**
 * Starts connecting an account: makes the secrets this browser alone knows
 * and keeps them for when the person comes back. `verifier` is also the
 * code challenge, since MyAnimeList only supports the plain method.
 */
export const begin = (source: AccountSource) => {
	const pending: Pending = {
		source,
		state: random(16),
		verifier: random(32),
	};
	attempt(() => sessionStorage.setItem(storageKey, JSON.stringify(pending)), DOMException);

	return {
		challenge: pending.verifier,
		state: pending.state,
	};
};

export type Returned =
	| { kind: "agreed"; source: AccountSource; code: string; verifier: string }
	| { kind: "refused" }
	| { kind: "unknown" };

/**
 * What a visit to the page says about connecting, from its address: the site
 * sent the person back with a code, or with a refusal. Anything that this
 * browser did not start, or whose `state` does not match, is `unknown` and
 * ignored; a site that sends no `state` back is trusted only for a
 * connection this browser started in this tab.
 */
export const returnedFrom = (search: string): Returned | null => {
	const params = new URLSearchParams(search);
	const code = params.get("code");
	const refused = params.has("error");
	if (!code && !refused) {
		return null;
	}

	const pending = read();
	forget();
	if (!pending) {
		return { kind: "unknown" };
	}
	if (refused) {
		return { kind: "refused" };
	}

	const state = params.get("state");
	if (!code || (state !== null && state !== pending.state)) {
		return { kind: "unknown" };
	}

	return {
		code,
		kind: "agreed",
		source: pending.source,
		verifier: pending.verifier,
	};
};
