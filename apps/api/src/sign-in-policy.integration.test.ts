import { afterAll, beforeAll, describe, expect, spyOn, test } from "bun:test";

import { auth } from "@sora/core/auth";
import { db } from "@sora/core/database";
import { minute } from "@sora/shared";
import { Hono } from "hono";

import { v1 } from "./v1";

const password = "test-fixture-password";
const email = "original_name@sora.invalid";
const username = "updated_name";

/** Password sign-ins through the API's `/v1/auth` routes, each from a given address. */
class SignIn {
	readonly #routes = new Hono().route("/v1", v1);

	send(path: "username" | "email", address: string, credentials: string | URLSearchParams) {
		return this.#routes.request(`http://localhost/v1/auth/sign-in/${path}`, {
			body: credentials,
			headers: {
				...(!(credentials instanceof URLSearchParams) && {
					"Content-Type": "application/json",
				}),
				"X-Forwarded-For": address,
				"X-Sora-Client-Key": process.env.WEB_CLIENT_KEY ?? "",
			},
			method: "POST",
		});
	}

	username(address: string) {
		return this.send(
			"username",
			address,
			JSON.stringify({
				password,
				username: username.toUpperCase(),
			}),
		);
	}

	email(address: string) {
		return this.send(
			"email",
			address,
			new URLSearchParams({
				email: email.toUpperCase(),
				password,
			}),
		);
	}
}

const signIn = new SignIn();

describe("password sign-in policy", () => {
	const clock = spyOn(performance, "now");

	beforeAll(async () => {
		clock.mockReturnValue(0);
		const context = await auth.$context;

		// The account kept its original email when its username changed.
		const user = await context.internalAdapter.createUser(
			{
				displayUsername: username,
				email,
				emailVerified: true,
				name: username,
				username,
			},
			{ method: "email-password" },
		);

		await context.internalAdapter.linkAccount({
			accountId: user.id,
			password: await context.password.hash(password),
			providerId: "credential",
			userId: user.id,
		});
	});

	afterAll(() => {
		clock.mockRestore();
	});

	test("shares five address attempts and rejects malformed input before looking up an account", async () => {
		const address = "198.51.100.12";
		using lookup = spyOn(db.query.authUser, "findFirst");

		const unparsed = await signIn.send("username", address, "{");
		expect(unparsed.status).toBe(400);

		const mistyped = await signIn.send(
			"username",
			address,
			JSON.stringify({
				password: 1,
				username,
			}),
		);

		expect(mistyped.status).toBe(400);

		const overlong = await signIn.send(
			"email",
			address,
			new URLSearchParams({
				email,
				password: "x".repeat(129),
			}),
		);

		expect(overlong.status).toBe(400);
		expect(lookup).toHaveBeenCalledTimes(0);

		const success = await signIn.username(address);
		expect(success.status).toBe(200);
		expect(success.headers.has("Set-Cookie")).toBe(true);

		const byEmail = await signIn.email(address);
		expect(byEmail.status).toBe(200);

		const again = await signIn.username(address);
		expect(again.status).toBe(200);

		const limited = await signIn.email(address);
		expect(limited.status).toBe(429);
		expect(limited.headers.get("Retry-After")).toBe("60");
		expect(limited.headers.get("X-Retry-After")).toBe("60");
		expect(lookup).toHaveBeenCalledTimes(3);

		clock.mockReturnValue(minute);

		const later = await signIn.email(address);
		expect(later.status).toBe(200);
	});

	test("shares the account ceiling across case, identifier, address and encoding", async () => {
		clock.mockReturnValue(2 * minute);

		// The generator resumes only after each response is read, so one password hash is in flight.
		const signIns = async function* signIns() {
			for (let index = 1; index <= 59; index += 1) {
				yield signIn.username(`192.0.2.${index}`);
			}
		};

		for await (const response of signIns()) {
			expect(response.status).toBe(200);
		}

		const last = await signIn.email("192.0.2.60");
		expect(last.status).toBe(200);

		const limited = await signIn.username("192.0.2.61");
		expect(limited.status).toBe(429);
		expect(await limited.json()).toMatchObject({ code: "TOO_MANY_REQUESTS" });

		const byEmail = await signIn.email("192.0.2.62");
		expect(byEmail.status).toBe(429);

		clock.mockReturnValue(3 * minute);

		const later = await signIn.username("192.0.2.61");
		expect(later.status).toBe(200);
	}, 30_000);

	test("rejects new address buckets at capacity and admits them after expiry", async () => {
		clock.mockReturnValue(4 * minute);
		using lookup = spyOn(db.query.authUser, "findFirst");

		const malformed = JSON.stringify({
			password: 1,
			username,
		});

		// The generator resumes only after each response is read, so the buckets fill without a burst.
		const fills = async function* fills() {
			for (let index = 0; index < 10_000; index += 1) {
				yield signIn.send(
					"username",
					`198.18.${Math.floor(index / 256)}.${index % 256}`,
					malformed,
				);
			}
		};

		for await (const response of fills()) {
			expect(response.status).toBe(400);
		}

		const limited = await signIn.username("203.0.113.20");
		expect(limited.status).toBe(429);
		expect(limited.headers.get("Retry-After")).toBe("60");
		expect(lookup).toHaveBeenCalledTimes(0);

		clock.mockReturnValue(5 * minute);

		const later = await signIn.username("203.0.113.20");
		expect(later.status).toBe(200);
	}, 30_000);
});
