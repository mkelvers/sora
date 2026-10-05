import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { bearer } from "better-auth/plugins";

import { config } from "../config";
import { db } from "../database/client";
import { authAccount, authSession, authUser, authVerification } from "../database/schema";
import { day } from "../time";
import { createProfile } from "./profiles";

/**
 * Accounts and sessions, by e-mail and password.
 *
 * Mount {@link auth.handler} at `/v1/auth/*`. Browsers may use its session
 * cookie; every other client (the web server, TV and mobile apps) sends the
 * session token as `Authorization: Bearer <token>`, which the `bearer`
 * plugin accepts. Signing in returns that token.
 *
 * Nobody can sign up: accounts are made with `bun run auth:create-account`.
 * A new account starts with one profile, named after the account.
 *
 * Sign-in is limited to a few tries a minute per client address, in
 * development too. The web server is the client of its visitors, so it
 * passes theirs in `X-Forwarded-For`, which is trusted: keep the API
 * reachable only through it (see `HOST`), or visitors can pick their own
 * address.
 */
export const auth = betterAuth({
	baseURL: config.authUrl,
	basePath: "/v1/auth",
	secret: config.authSecret,
	trustedOrigins: config.authTrustedOrigins,
	database: drizzleAdapter(db, {
		provider: "pg",
		schema: {
			user: authUser,
			session: authSession,
			account: authAccount,
			verification: authVerification,
		},
	}),
	emailAndPassword: {
		enabled: true,
		disableSignUp: true,
		minPasswordLength: 8,
	},
	session: {
		// Long-lived, as TVs and phones stay signed in; renewed daily while used.
		expiresIn: (90 * day) / 1_000,
		updateAge: day / 1_000,
	},
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
	rateLimit: {
		enabled: true,
		window: 60,
		max: 100,
		customRules: {
			"/sign-in/email": {
				window: 60,
				max: 5,
			},
		},
	},
	advanced: {
		ipAddress: {
			ipAddressHeaders: ["x-forwarded-for"],
		},
	},
	plugins: [bearer()],
});
