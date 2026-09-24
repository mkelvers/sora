import { db } from "@sora/core/database";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { bearer } from "better-auth/plugins";

import { config } from "../config";
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
  trustedOrigins: config.trustedOrigins,
  database: drizzleAdapter(db, {
    provider: "pg",
    schema
  }),
  emailAndPassword: {
    enabled: true
  },
  plugins: [bearer()]
});
