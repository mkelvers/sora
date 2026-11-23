import { lookup as lookupAddresses } from "node:dns/promises";
import type http from "node:http";
import { isIP } from "node:net";

import { attempt, defined } from "@sora/shared";

import { StreamTokenError } from "../../errors";

/** A hostname or IP address the proxy may be asked to connect to. */
export class Host {
	readonly #name: string;

	constructor(name: string) {
		this.#name = name;
	}

	/** Whether it is an IP address that is loopback, private, link-local, reserved, or multicast. */
	get private() {
		const version = isIP(this.#name);

		if (version === 4) {
			return /^(?:0|10|127|169\.254|172\.(?:1[6-9]|2\d|3[01])|192\.168|192\.0\.0|198\.1[89]|100\.(?:6[4-9]|[7-9]\d|1[01]\d|12[0-7])|22[4-9]|2[3-5]\d)\./u.test(
				this.#name,
			);
		}

		return version === 6 && /^(?:::1?$|f[cd]|fe[89ab]|ff|::ffff:)/iu.test(this.#name);
	}

	/** Whether it names this machine or an internal network, by name or as a private IP literal. */
	get internal() {
		const local =
			this.#name === "localhost" ||
			this.#name.endsWith(".localhost") ||
			this.#name.endsWith(".internal");

		return local || this.private;
	}

	/**
	 * Resolves the hostname for a connection, refusing when any of its addresses
	 * is not public. The connection uses these very addresses, so a server that
	 * answers a name with a public address first and a private one next (DNS
	 * rebinding) cannot steer it.
	 */
	async lookup(
		options: { all?: boolean },
		respond: Parameters<NonNullable<http.RequestOptions["lookup"]>>[2],
	) {
		const { data: addresses, error } = await attempt(
			lookupAddresses(this.#name, {
				...options,
				all: true,
			}),
		);

		if (error) {
			respond(error, []);

			return;
		}

		if (addresses.some(({ address }) => new Host(address).private)) {
			respond(new StreamTokenError("Stream target is not a public host"), []);

			return;
		}

		if (options.all) {
			respond(null, addresses);

			return;
		}

		respond(null, defined(addresses[0]).address, defined(addresses[0]).family);
	}
}
