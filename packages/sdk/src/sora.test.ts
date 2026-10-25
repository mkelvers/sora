import { describe, expect, test } from "bun:test";

import { attempt, defined } from "@sora/shared";

import { route, SoraClient, SoraError } from "./index";

/** A client whose requests are answered by `answer`, and recorded. */
const clientAnswering = (answer: () => Response, options: { baseUrl?: string } = {}) => {
	const requests: Request[] = [];
	const sora = new SoraClient({
		baseUrl: options.baseUrl ?? "https://sora.test",
		fetch: (input, init) => {
			requests.push(new Request(input as string, init));
			return Promise.resolve(answer());
		},
		headers: {
			Authorization: "Bearer token",
		},
	});

	return {
		requests,
		sora,
	};
};

const genres = () =>
	Response.json({
		meta: {
			count: 2,
		},
		results: ["Action", "Comedy"],
	});

describe("SoraClient.request", () => {
	test("resolves to a response's results, and requestWithMeta to the whole body", async () => {
		const { sora } = clientAnswering(genres);

		expect(await sora.request(route.listGenres)).toEqual(["Action", "Comedy"]);
		expect(await sora.requestWithMeta(route.listGenres)).toEqual({
			meta: {
				count: 2,
			},
			results: ["Action", "Comedy"],
		});
	});

	test("fills in path parameters and writes query values as text", async () => {
		const { sora, requests } = clientAnswering(() => new Response(null, { status: 500 }));

		await attempt(
			sora.request(route.listReleases, {
				query: {
					format: ["TV", "MOVIE"],
					page: 2,
					per_page: 36,
				},
			}),
		);
		await attempt(
			sora.request(route.getSeries, {
				params: {
					series_id: "A/B C",
				},
				query: {
					episodes: true,
				},
			}),
		);
		await attempt(
			sora.request(route.listImages, {
				params: {
					series_id: "GYZJ43JMR",
				},
				query: {
					language: ["en", null],
				},
			}),
		);

		expect(requests.map((request) => request.url)).toEqual([
			"https://sora.test/v1/releases?format=TV%2CMOVIE&page=2&per_page=36",
			"https://sora.test/v1/series/A%2FB%20C?episodes=true",
			"https://sora.test/v1/series/GYZJ43JMR/images?language=en%2Cnone",
		]);
	});

	test("sends the method, headers, and JSON body", async () => {
		const { sora, requests } = clientAnswering(() => new Response(null, { status: 204 }), {
			baseUrl: "https://sora.test///",
		});

		const result = await sora.request(route.setWatchlistStatus, {
			body: {
				status: "watching",
			},
			params: {
				profile_id: "P1",
				series_id: "S1",
			},
		});

		const [request] = requests;
		expect(result).toBeUndefined();
		expect(request?.method).toBe("PUT");
		expect(request?.url).toBe("https://sora.test/v1/profiles/P1/watchlist/S1");
		expect(request?.headers.get("Authorization")).toBe("Bearer token");
		expect(request?.headers.get("Content-Type")).toBe("application/json");
		expect(await request?.json()).toEqual({
			status: "watching",
		});
	});

	test("throws the API's problem as a SoraError", async () => {
		const { sora } = clientAnswering(() =>
			Response.json(
				{
					code: "SERIES_NOT_FOUND",
					detail: "Series S1 does not exist",
					status: 404,
					title: "Not Found",
					type: "about:blank",
				},
				{
					status: 404,
				},
			),
		);

		const { error } = await attempt(
			sora.request(route.listEpisodes, {
				params: {
					series_id: "S1",
				},
			}),
			SoraError,
		);

		expect(error?.status).toBe(404);
		expect(error?.code).toBe("SERIES_NOT_FOUND");
	});

	test("keeps malformed failure bodies as HTTP errors", async () => {
		for (const body of [
			null,
			[],
			"Bad gateway",
			{ detail: 502 },
			{ code: 502 },
			{
				message: { text: "Bad gateway" },
			},
			{ errors: "Bad gateway" },
			{
				errors: [{ path: "email" }],
			},
		]) {
			const { sora } = clientAnswering(() =>
				Response.json(body, { status: 502, statusText: "Bad Gateway" }),
			);
			const { error } = await attempt(sora.request(route.listGenres), SoraError);

			expect(error?.status).toBe(502);
			expect(error?.code).toBe("HTTP_ERROR");
			expect(error?.message).toBe("The API answered 502 Bad Gateway");
			expect(error?.errors).toEqual([]);
		}
	});

	test("keeps Better Auth's error message and code", async () => {
		const { sora } = clientAnswering(() =>
			Response.json(
				{
					code: "INVALID_USERNAME_OR_PASSWORD",
					message: "Invalid username or password",
				},
				{ status: 401 },
			),
		);
		const { error } = await attempt(
			sora.signIn({ password: "wrong-password", username: "viewer" }),
			SoraError,
		);

		expect(error?.code).toBe("INVALID_USERNAME_OR_PASSWORD");
		expect(error?.message).toBe("Invalid username or password");
	});

	test("changes the password, ends other sessions, and returns the new token", async () => {
		const { sora, requests } = clientAnswering(() => Response.json({ token: "new-token" }));
		const changed = await sora.changePassword({
			currentPassword: "old-password",
			newPassword: "new-password",
		});

		expect(changed).toEqual({ token: "new-token" });
		expect(new URL(defined(requests[0]).url).pathname).toBe("/v1/auth/change-password");
		expect(await defined(requests[0]).json()).toEqual({
			currentPassword: "old-password",
			newPassword: "new-password",
			revokeOtherSessions: true,
		});
	});

	test("keeps validation errors and the retry delay from a problem response", async () => {
		const errors = [{ message: "Invalid email", path: "email" }];
		const { sora } = clientAnswering(() =>
			Response.json(
				{ code: "INVALID_INPUT", detail: "Check the fields", errors },
				{
					headers: { "Retry-After": "30" },
					status: 429,
				},
			),
		);
		const { error } = await attempt(sora.request(route.listGenres), SoraError);

		expect(error?.code).toBe("INVALID_INPUT");
		expect(error?.message).toBe("Check the fields");
		expect(error?.errors).toEqual(errors);
		expect(error?.retryAfterSeconds).toBe(30);
	});

	test("throws when a response does not match the contract", async () => {
		const { sora } = clientAnswering(() =>
			Response.json({
				meta: {
					count: "two",
				},
				results: ["Action", 7],
			}),
		);

		const { error } = await attempt(sora.request(route.listGenres), SoraError);

		expect(error?.code).toBe("INVALID_RESPONSE");
		expect(error?.status).toBe(200);
	});

	test("throws when a response is not JSON", async () => {
		const { sora } = clientAnswering(() => new Response("<html>", { status: 200 }));

		const { error } = await attempt(sora.request(route.listGenres), SoraError);

		expect(error?.code).toBe("INVALID_RESPONSE");
	});
});

/** Never called: it only has to compile, which `bun run check` makes sure of. */
const typesAreChecked = async () => {
	const sora = new SoraClient({
		baseUrl: "https://sora.test",
	});

	const names: string[] = await sora.request(route.listGenres);
	const page = await sora.requestWithMeta(route.listReleases, {
		query: {
			page: 1,
		},
	});
	const hasNext: boolean = page.meta.has_next_page;
	const nothing: undefined = await sora.request(route.dismissNotification, {
		params: {
			notification_id: "S1:2",
			profile_id: "P1",
		},
	});

	// @ts-expect-error a route's required path parameters cannot be left out
	await sora.request(route.getSeries);
	// @ts-expect-error a number is a number, not text
	await sora.request(route.listReleases, { query: { page: "1" } });
	// @ts-expect-error a query parameter the route does not have
	await sora.request(route.listReleases, { query: { colour: "red" } });
	// @ts-expect-error a body the route requires
	await sora.request(route.markNotificationsRead, { params: { profile_id: "P1" } });
	await sora.request(route.setWatchlistStatus, {
		// @ts-expect-error a status the route does not know
		body: { status: "bored" },
		params: { profile_id: "P1", series_id: "S1" },
	});
	// @ts-expect-error results are not a number
	const wrong: number = await sora.request(route.listGenres);

	return [names, hasNext, nothing, wrong];
};
void typesAreChecked;
