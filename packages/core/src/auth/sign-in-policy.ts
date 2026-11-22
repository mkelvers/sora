import { createHash } from "node:crypto";

import { formatRetryAfter, minute } from "@sora/shared";
import { APIError, createAuthMiddleware, getIP } from "better-auth/api";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "../database/client";
import { authUser } from "../database/schema/auth";

const Username = z.string().regex(/^[a-zA-Z0-9_.]{3,30}$/u);

const PasswordBody = z.object({
	callbackURL: z.string().optional(),
	password: z.string(),
	rememberMe: z.boolean().optional(),
});

const UsernameBody = PasswordBody.extend({
	password: z.string().min(1),
	username: Username,
}).transform(({ password, username }) => ({
	identity: username.toLowerCase(),
	password,
}));

const EmailBody = PasswordBody.extend({ email: z.email() }).transform(({ email, password }) => ({
	identity: email.toLowerCase(),
	password,
}));

const soraEmailSuffix = "@sora.invalid";

const maxBuckets = 10_000;

const windows = new Map<
	string,
	{
		count: number;
		expiresAt: number;
	}
>();

const rejectUntil = (expiresAt: number, now: number): never => {
	const retryAfter = formatRetryAfter(expiresAt - now);
	throw new APIError(
		"TOO_MANY_REQUESTS",
		{
			code: "TOO_MANY_REQUESTS",
			message: "Too many requests; try again shortly",
		},
		{
			"Cache-Control": "no-store",
			"Retry-After": retryAfter,
			"X-Retry-After": retryAfter,
		},
	);
};

const countAttempt = (key: string, limit: number) => {
	const now = performance.now();
	// All windows have the same duration, so insertion order is expiry order.
	let oldest = windows.entries().next().value;

	while (oldest && oldest[1].expiresAt <= now) {
		windows.delete(oldest[0]);
		oldest = windows.entries().next().value;
	}

	const window = windows.get(key);

	if (!window) {
		if (oldest && windows.size >= maxBuckets) {
			rejectUntil(oldest[1].expiresAt, now);
		}

		windows.set(key, {
			count: 1,
			expiresAt: now + minute,
		});

		return;
	}

	if (window.count >= limit) {
		rejectUntil(window.expiresAt, now);
	}

	window.count += 1;
};

const unresolvedEmail = (email: string) => {
	// Count unknown Sora names the same way on both endpoints.
	const localPart = email.slice(0, -soraEmailSuffix.length);

	if (email.endsWith(soraEmailSuffix) && Username.safeParse(localPart).success) {
		return `username:${localPart}`;
	}

	return `email:${createHash("sha256").update(email).digest("hex")}`;
};

/**
 * Both HTTP password routes share fixed one-minute windows, five attempts per
 * client address and sixty per account. The API must establish the trusted
 * address before dispatch. Better Auth parses the body and still owns form
 * validation, password checks, and session creation.
 *
 * Each API replica grants its own budget and resets it on restart. At 10,000
 * buckets, new keys wait for a window to expire. A fleet-wide budget needs
 * shared atomic counters and expiry.
 */
export const limitPasswordSignIn = createAuthMiddleware(async (ctx) => {
	const byUsername = ctx.path === "/sign-in/username";

	if (!ctx.request || (!byUsername && ctx.path !== "/sign-in/email")) {
		return;
	}

	const address = getIP(ctx.request, ctx.context.options) ?? "unknown";
	countAttempt(`address:${address}`, 5);

	const parsed = (byUsername ? UsernameBody : EmailBody).safeParse(ctx.body);

	if (
		!parsed.success ||
		parsed.data.password.length > ctx.context.password.config.maxPasswordLength
	) {
		return;
	}

	const { identity } = parsed.data;

	const account = await db.query.authUser.findFirst({
		columns: { id: true },
		where: eq(byUsername ? authUser.username : authUser.email, identity),
	});

	if (account) {
		countAttempt(`account:${account.id}`, 60);
	} else {
		countAttempt(byUsername ? `username:${identity}` : unresolvedEmail(identity), 60);
	}
});
