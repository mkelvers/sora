import { OpenAPIHono } from "@hono/zod-openapi";

import { sendProblem } from "./problem";
import type { AppEnv } from "./session";

/**
 * Creates a router whose request validation failures are answered as 422
 * problems listing every invalid field.
 */
export function createRouter() {
  return new OpenAPIHono<AppEnv>({
    defaultHook: (result, c) => {
      if (!result.success) {
        return sendProblem(c, 422, "INVALID_INPUT", "The request is invalid", {
          errors: result.error.issues.map((issue) => ({
            path: issue.path.join("."),
            message: issue.message
          }))
        });
      }
    }
  });
}

/** `Cache-Control` for public responses that may be cached for `seconds`. */
export function publicCache(seconds: number) {
  return `public, max-age=${seconds}`;
}
