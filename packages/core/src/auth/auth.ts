import { day } from "@sora/shared";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { bearer, username } from "better-auth/plugins";

import { config } from "../config";
import { db } from "../database/client";
import { authAccount, authSession, authUser, authVerification } from "../database/schema/auth";
import { createProfile } from "./profiles";

/**
 * Accounts and sessions, by username and password.
 *
 * Mount {@link auth.handler} at `/v1/auth/*`. Browsers may use its session
 * cookie; every other client (the web server, TV and mobile apps) sends the
 * session token as `Authorization: Bearer <token>`, which the `bearer`
 * plugin accepts. Signing in returns that token.
 *
 * Nobody can sign up: accounts are made with `bun run auth:create-account`.
 * A new account starts with one profile, named after the account. Better
 * Auth insists on an e-mail, so accounts hold `<username>@sora.invalid`.
 *
 * Sign-in is limited to a few tries a minute per client address, in
 * development too. The web server is the client of its visitors, so it
 * passes theirs in `X-Forwarded-For`. The API believes that header only from
 * a request that carries the web client key (see `clientAddress` in the API);
 * for any other it counts the address the request connected from.
 */
export const auth = betterAuth({
	advanced: {
		ipAddress: {
			ipAddressHeaders: ["x-forwarded-for"],
		},
	},
	basePath: "/v1/auth",
	database: drizzleAdapter(db, {
		provider: "pg",
		schema: {
			account: authAccount,
			session: authSession,
			user: authUser,
			verification: authVerification,
		},
	}),
	databaseHooks: {
		user: {
			create: {
				after: async (user) => {
					await createProfile(user.id, {
						name: user.name,
					});
				},
			},
		},
	},
	emailAndPassword: {
		disableSignUp: true,
		enabled: true,
		minPasswordLength: 8,
	},
	plugins: [bearer(), username()],
	rateLimit: {
		customRules: {
			"/sign-in/username": {
				max: 5,
				window: 60,
			},
		},
		enabled: true,
		max: 100,
		window: 60,
	},
	secret: config.authSecret,
	session: {
		// Long-lived, as TVs and phones stay signed in; renewed daily while used.
		expiresIn: (90 * day) / 1000,
		updateAge: day / 1000,
	},
});
