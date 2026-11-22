import { createHash } from "node:crypto";

import { createAuthMiddleware, getIP } from "better-auth/api";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "../database/client";
import { authUser } from "../database/schema/auth";
import { Attempts } from "./attempts";

const Username = z.string().regex(/^[a-zA-Z0-9_.]{3,30}$/u);

const PasswordBody = z.object({
	callbackURL: z.string().optional(),
	password: z.string(),
	rememberMe: z.boolean().optional(),
});

const soraEmailSuffix = "@sora.invalid";

const attempts = new Attempts();

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
export const limitSignIn = createAuthMiddleware(async (endpoint) => {
	const byUsername = endpoint.path === "/sign-in/username";

	const signIn = byUsername || endpoint.path === "/sign-in/email";

	if (!endpoint.request || !signIn) {
		return;
	}

	// Requests whose address cannot be read share one budget.
	const address = getIP(endpoint.request, endpoint.context.options);
	attempts.count(`address:${address ?? "*"}`, 5);

	let Body: z.ZodType<{
		identity: string;
		password: string;
	}> = PasswordBody.extend({ email: z.email() }).transform(({ email, password }) => ({
		identity: email.toLowerCase(),
		password,
	}));

	if (byUsername) {
		Body = PasswordBody.extend({
			password: z.string().min(1),
			username: Username,
		}).transform(({ password, username }) => ({
			identity: username.toLowerCase(),
			password,
		}));
	}

	const parsed = Body.safeParse(endpoint.body);

	if (
		!parsed.success ||
		parsed.data.password.length > endpoint.context.password.config.maxPasswordLength
	) {
		return;
	}

	const { identity } = parsed.data;
	let column: typeof authUser.email | typeof authUser.username = authUser.email;

	if (byUsername) {
		column = authUser.username;
	}

	const account = await db.query.authUser.findFirst({
		columns: { id: true },
		where: eq(column, identity),
	});

	if (account) {
		attempts.count(`account:${account.id}`, 60);

		return;
	}

	if (byUsername) {
		attempts.count(`username:${identity}`, 60);

		return;
	}

	// Count unknown Sora names the same way on both endpoints.
	const localPart = identity.slice(0, -soraEmailSuffix.length);
	const isSoraName = identity.endsWith(soraEmailSuffix) && Username.safeParse(localPart).success;

	if (isSoraName) {
		attempts.count(`username:${localPart}`, 60);

		return;
	}

	attempts.count(`email:${createHash("sha256").update(identity).digest("hex")}`, 60);
});
