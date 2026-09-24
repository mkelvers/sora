import { OpenAPIHono } from "@hono/zod-openapi";
import { Scalar } from "@scalar/hono-api-reference";
import { cors } from "hono/cors";
import { etag } from "hono/etag";

import { auth } from "./auth/auth";
import { config } from "./config";
import { problemFromError, sendProblem } from "./http/problem";
import type { AppEnv } from "./http/session";
import { animeRoutes } from "./routes/anime";
import { meRoutes } from "./routes/me";
import { playbackRoutes } from "./routes/playback";

/**
 * Builds the HTTP API.
 *
 * - `/anime`, `/seasons`, `/genres`, `/schedule`: the public catalog.
 * - `/seasons/…/playback`, `/streams`: playback.
 * - `/me/…`: the signed-in user's library.
 * - `/auth/…`: Better Auth (sign up, sign in, sessions).
 * - `/openapi.json` and `/docs`: the API's description.
 *
 * Every error is an RFC 9457 problem with a stable `code`.
 */
export function createApp() {
  const app = new OpenAPIHono<AppEnv>();

  app.use(
    "*",
    cors({
      origin: config.trustedOrigins,
      credentials: true,
      allowHeaders: [
        "Content-Type",
        "Authorization",
        "Range"
      ],
      allowMethods: [
        "GET",
        "POST",
        "PUT",
        "DELETE",
        "OPTIONS"
      ],
      exposeHeaders: [
        "set-auth-token",
        "Retry-After",
        "ETag",
        "Content-Range",
        "Accept-Ranges"
      ]
    })
  );

  // Catalog responses change rarely; ETags let clients revalidate cheaply.
  // Streams are excluded: hashing video segments would be wasted work.
  for (const path of [
    "/anime",
    "/anime/*",
    "/seasons/*",
    "/genres",
    "/schedule"
  ]) {
    app.use(path, etag());
  }

  app.on(
    [
      "GET",
      "POST"
    ],
    "/auth/*",
    (c) => auth.handler(c.req.raw)
  );

  app.route("/", animeRoutes);
  app.route("/", playbackRoutes);
  app.route("/", meRoutes);

  app.get("/health", (c) =>
    c.json({
      status: "ok"
    })
  );

  app.openAPIRegistry.registerComponent("securitySchemes", "bearerAuth", {
    type: "http",
    scheme: "bearer",
    description: "A session token from the `set-auth-token` header of a Better Auth sign-in (`POST /auth/sign-in/email`)."
  });
  app.openAPIRegistry.registerComponent("securitySchemes", "cookieAuth", {
    type: "apiKey",
    in: "cookie",
    name: "better-auth.session_token",
    description: "Better Auth's session cookie, for browser clients."
  });

  app.doc31("/openapi.json", {
    openapi: "3.1.0",
    info: {
      title: "Sora API",
      version: "0.0.1",
      description:
        "Anime titles laid out like a streaming service: one title per show with its seasons, OVAs, and related films. Titles, seasons, and episodes are addressed by Sora's own IDs. Errors are RFC 9457 problems (`application/problem+json`) with a stable `code`. Authentication (`/auth/*`) is Better Auth; see its documentation for the sign-up and sign-in endpoints."
    },
    servers: [
      {
        url: config.authUrl
      }
    ],
    tags: [
      {
        name: "Anime",
        description: "The public catalog."
      },
      {
        name: "Playback",
        description: "Streams, skip times, and the stream proxy."
      },
      {
        name: "Me",
        description: "The signed-in user's watchlist, progress, and continue watching."
      }
    ]
  });

  app.get(
    "/docs",
    Scalar({
      url: "/openapi.json",
      pageTitle: "Sora API"
    })
  );

  app.notFound((c) => sendProblem(c, 404, "NOT_FOUND", `No endpoint matches ${c.req.method} ${c.req.path}`));
  app.onError(problemFromError);

  return app;
}
