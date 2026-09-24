import { createMiddleware } from "hono/factory";

import { auth } from "../auth/auth";
import { sendProblem } from "./problem";

/** The signed-in user, as Better Auth describes them. */
export type SessionUser = typeof auth.$Infer.Session.user;

/** Variables routes can read from the context. */
export interface AppEnv {
  Variables: {
    user: SessionUser;
  };
}

/**
 * Requires a signed-in user and exposes them as `c.var.user`.
 *
 * Accepts Better Auth's session cookie or `Authorization: Bearer <token>`.
 * Anything else is answered with 401 before the route runs. Responses to
 * signed-in requests are personal, so they are never cached.
 */
export const requireUser = createMiddleware<AppEnv>(async (c, next) => {
  const session = await auth.api.getSession({
    headers: c.req.raw.headers
  });

  if (!session) {
    const response = sendProblem(c, 401, "UNAUTHORIZED", "Sign in to use this endpoint");
    response.headers.set("WWW-Authenticate", 'Bearer realm="sora"');
    return response;
  }

  c.set("user", session.user);
  await next();
  c.header("Cache-Control", "private, no-store");
});
