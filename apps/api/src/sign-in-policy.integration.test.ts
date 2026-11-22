import { afterAll, beforeAll, describe, expect, spyOn, test } from "bun:test";

import { auth } from "@sora/core/auth";
import { db } from "@sora/core/database";
import { minute } from "@sora/shared";
import { Hono } from "hono";

import { databaseTestsEnabled } from "../../../packages/core/test/integration";
import { v1Routes } from "./v1";

const password = "test-fixture-password";
const email = "original_name@sora.invalid";
const username = "updated_name";
const routes = new Hono().route("/v1", v1Routes);

const signIn = (
	path: "username" | "email",
	address: string,
	credentials: string | URLSearchParams,
) =>
	routes.request(`http://localhost/v1/auth/sign-in/${path}`, {
		body: credentials,
		headers: {
			...(typeof credentials === "string" && { "Content-Type": "application/json" }),
			"X-Forwarded-For": address,
			"X-Sora-Client-Key": process.env.WEB_CLIENT_KEY ?? "",
		},
		method: "POST",
	});

const signInUsername = (address: string) =>
	signIn(
		"username",
		address,
		JSON.stringify({
			password,
			username: username.toUpperCase(),
		}),
	);

const signInEmail = (address: string) =>
	signIn(
		"email",
		address,
		new URLSearchParams({
			email: email.toUpperCase(),
			password,
		}),
	);

const statusOf = async (request: Response | Promise<Response>) => {
	const response = await request;

	return response.status;
};

describe.skipIf(!databaseTestsEnabled())("password sign-in policy", () => {
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

		expect(await statusOf(signIn("username", address, "{"))).toBe(400);
		expect(
			await statusOf(
				signIn(
					"username",
					address,
					JSON.stringify({
						password: 1,
						username,
					}),
				),
			),
		).toBe(400);
		expect(
			await statusOf(
				signIn(
					"email",
					address,
					new URLSearchParams({
						email,
						password: "x".repeat(129),
					}),
				),
			),
		).toBe(400);
		expect(lookup).toHaveBeenCalledTimes(0);

		const success = await signInUsername(address);
		expect(success.status).toBe(200);
		expect(success.headers.has("Set-Cookie")).toBe(true);
		expect(await statusOf(signInEmail(address))).toBe(200);
		expect(await statusOf(signInUsername(address))).toBe(200);

		const limited = await signInEmail(address);
		expect(limited.status).toBe(429);
		expect(limited.headers.get("Retry-After")).toBe("60");
		expect(limited.headers.get("X-Retry-After")).toBe("60");
		expect(lookup).toHaveBeenCalledTimes(3);

		clock.mockReturnValue(minute);
		expect(await statusOf(signInEmail(address))).toBe(200);
	});

	test("shares the account ceiling across case, identifier, address and encoding", async () => {
		clock.mockReturnValue(2 * minute);

		for (let index = 1; index <= 59; index += 1) {
			// oxlint-disable-next-line no-await-in-loop -- Keep one password hash in flight.
			expect(await statusOf(signInUsername(`192.0.2.${index}`))).toBe(200);
		}

		expect(await statusOf(signInEmail("192.0.2.60"))).toBe(200);

		const limited = await signInUsername("192.0.2.61");
		expect(limited.status).toBe(429);
		expect(await limited.json()).toMatchObject({ code: "TOO_MANY_REQUESTS" });
		expect(await statusOf(signInEmail("192.0.2.62"))).toBe(429);

		clock.mockReturnValue(3 * minute);
		expect(await statusOf(signInUsername("192.0.2.61"))).toBe(200);
	}, 30_000);

	test("rejects new address buckets at capacity and admits them after expiry", async () => {
		clock.mockReturnValue(4 * minute);
		using lookup = spyOn(db.query.authUser, "findFirst");
		const malformed = JSON.stringify({
			password: 1,
			username,
		});

		for (let index = 0; index < 10_000; index += 1) {
			const address = `198.18.${Math.floor(index / 256)}.${index % 256}`;
			// oxlint-disable-next-line no-await-in-loop -- Fill the buckets without a concurrency burst.
			expect(await statusOf(signIn("username", address, malformed))).toBe(400);
		}

		const limited = await signInUsername("203.0.113.20");
		expect(limited.status).toBe(429);
		expect(limited.headers.get("Retry-After")).toBe("60");
		expect(lookup).toHaveBeenCalledTimes(0);

		clock.mockReturnValue(5 * minute);
		expect(await statusOf(signInUsername("203.0.113.20"))).toBe(200);
	}, 30_000);
});
