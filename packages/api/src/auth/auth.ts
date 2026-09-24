import { db } from "@sora/core/database";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { bearer } from "better-auth/plugins";

import { config } from "../config";

/** The request header the API passes the client's address to Better Auth in. */
export const clientAddressHeader = "x-sora-client-address";
import * as schema from "./schema";

/**
 * The identity layer in front of the core.
 *
 * Every client signs in here: browsers get a session cookie, native and TV
 * clients read the session token from the `set-auth-token` response header
 * and send it as `Authorization: Bearer <token>`. The user's ID is the opaque
 * `userId` the core's library functions take.
 */
export const auth = betterAuth({
  appName: "Sora",
  baseURL: config.authUrl,
  basePath: "/auth",
  secret: config.authSecret,
  // Better Auth reads the same `https://*.example.com` wildcards.
  trustedOrigins: config.trustedOrigins.map((pattern) => pattern.source),
  database: drizzleAdapter(db, {
    provider: "pg",
    schema
  }),
  // Email and password is the only way to sign in.
  emailAndPassword: {
    enabled: true
  },
  // On in every environment, not only production. Sign-in and sign-up get
  // Better Auth's stricter built-in rules.
  rateLimit: {
    enabled: true
  },
  advanced: {
    ipAddress: {
      // Set by the API from `clientAddress`, never taken from the client.
      ipAddressHeaders: [clientAddressHeader]
    }
  },
  plugins: [bearer()]
});
