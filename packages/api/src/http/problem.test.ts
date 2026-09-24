import { describe, expect, test } from "bun:test";
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { PlaybackUnavailableError, SeriesNotFoundError, UpstreamUnavailableError } from "@sora/core/errors";

import { ProblemSchema } from "../schemas/common";
import { problemFromError, ProblemError } from "./problem";
import { createRouter } from "./router";

/** An app whose only route throws `error`. */
function throwing(error: unknown) {
  const app = new OpenAPIHono();
  app.get("/fail", () => {
    throw error;
  });
  app.onError(problemFromError);
  return app;
}

/** Reads a problem body, checking it against the documented schema. */
async function problemOf(response: Response) {
  expect(response.headers.get("Content-Type")).toBe("application/problem+json");
  return ProblemSchema.parse(await response.json());
}

describe("problemFromError", () => {
  test("answers a core error with its status and code", async () => {
    const response = await throwing(new SeriesNotFoundError("a_x")).request("/fail");
    expect(response.status).toBe(404);
    expect(await problemOf(response)).toEqual({
      type: "about:blank",
      title: "Not Found",
      status: 404,
      detail: "Series a_x does not exist",
      instance: "/fail",
      code: "SERIES_NOT_FOUND"
    });
  });

  test("passes an upstream's retry delay on as Retry-After, in whole seconds", async () => {
    const response = await throwing(
      new UpstreamUnavailableError("AniList is rate limited", {
        retryAfterMs: 1_500
      })
    ).request("/fail");
    expect(response.status).toBe(503);
    expect(response.headers.get("Retry-After")).toBe("2");
  });

  test("answers unplayable episodes as a bad gateway", async () => {
    const response = await throwing(new PlaybackUnavailableError("s_x", 1, [])).request("/fail");
    expect(response.status).toBe(502);
  });

  test("answers HTTP-layer problems as thrown", async () => {
    const response = await throwing(new ProblemError(404, "WATCHLIST_ENTRY_NOT_FOUND", "Not listed")).request("/fail");
    expect(response.status).toBe(404);
    expect((await problemOf(response)).code).toBe("WATCHLIST_ENTRY_NOT_FOUND");
  });

  test("hides the details of unexpected errors", async () => {
    const originalError = console.error;
    console.error = () => {};
    try {
      const response = await throwing(new Error("database password is hunter2")).request("/fail");
      expect(response.status).toBe(500);
      const body = await problemOf(response);
      expect(body.code).toBe("INTERNAL_ERROR");
      expect(JSON.stringify(body)).not.toContain("hunter2");
    } finally {
      console.error = originalError;
    }
  });
});

describe("createRouter", () => {
  test("answers invalid requests with every invalid field", async () => {
    const router = createRouter().openapi(
      createRoute({
        method: "get",
        path: "/items",
        request: {
          query: z.object({
            limit: z.coerce.number().int().max(10)
          })
        },
        responses: {
          200: {
            description: "Items."
          }
        }
      }),
      (c) => c.body(null, 200)
    );

    const response = await router.request("/items?limit=99");
    expect(response.status).toBe(422);
    expect((await problemOf(response)).errors).toEqual([
      {
        path: "limit",
        message: "Too big: expected number to be <=10"
      }
    ]);
  });
});
