import { createRoute, z } from "@hono/zod-openapi";
import {
	ImportAuthorizationUrlSchema,
	ImportAuthorizeRequestSchema,
	ImportConnectionSchema,
	ImportOptionsSchema,
	ImportUndoSchema,
	LibraryExportSchema,
	LibraryImportReportSchema,
	LibraryImportSchema,
} from "@sora/core/models/transfer";

import { CountMetaSchema, envelopeOf } from "../../openapi/envelope";
import { json, problem, EmptyMetaSchema, signedIn, ProfileParams } from "../../openapi/schemas";

/** Exporting a profile's library and importing one from AniList or MyAnimeList. */
export const transferRoute = {
	authorizeImport: createRoute({
		description:
			"Where to send the person to connect an AniList or MyAnimeList account and agree to Sora reading their list. The browser makes `state` and `code_challenge` itself and keeps them: when the site sends the person back to `redirect_uri` with a `code`, they go to `importLibrary` with it, together with the secret `code_challenge` was made from (`code_verifier`). Sora uses the code once and keeps nothing.",
		method: "post",
		operationId: "authorizeImport",
		path: "/library/import-authorization",
		request: {
			body: {
				content: {
					"application/json": {
						schema: ImportAuthorizeRequestSchema,
					},
				},
				required: true,
			},
		},
		responses: {
			200: json(envelopeOf(ImportAuthorizationUrlSchema, EmptyMetaSchema), "Where to send them."),
			401: problem("Not signed in."),
			422: problem("The body is invalid, or that account is not set up on this Sora."),
		},
		security: signedIn,
		summary: "Start connecting an account to import from",
		tags: ["Profiles"],
	}),
	disconnectImport: createRoute({
		description: "Forgets a connected account. What it already imported stays on the profile.",
		method: "delete",
		operationId: "disconnectImport",
		path: "/profiles/{profile_id}/library/connections/{source}",
		request: {
			params: ProfileParams.extend({
				source: ImportConnectionSchema.shape.source.openapi({
					param: {
						in: "path",
						name: "source",
					},
				}),
			}),
		},
		responses: {
			204: {
				description: "Disconnected, or was not connected.",
			},
			401: problem("Not signed in."),
			404: problem("The account has no such profile."),
		},
		security: signedIn,
		summary: "Disconnect an account",
		tags: ["Profiles"],
	}),
	exportLibrary: createRoute({
		description:
			"The profile's watchlist and its history of played episodes as one document, by AniList ID so it can move between Sora installs. Hand it back to `importLibrary` to restore it.",
		method: "get",
		operationId: "exportLibrary",
		path: "/profiles/{profile_id}/library/export",
		request: {
			params: ProfileParams,
		},
		responses: {
			200: json(envelopeOf(LibraryExportSchema, EmptyMetaSchema), "The document."),
			401: problem("Not signed in."),
			404: problem("The account has no such profile."),
		},
		security: signedIn,
		summary: "Export the profile's watchlist and history",
		tags: ["Profiles"],
	}),
	getImportOptions: createRoute({
		description:
			"Which accounts people can connect to import from on this Sora. An account is on when its client is set up; otherwise the list is imported from a username or a file.",
		method: "get",
		operationId: "getImportOptions",
		path: "/library/import-options",
		responses: {
			200: json(envelopeOf(ImportOptionsSchema, EmptyMetaSchema), "What is set up."),
			401: problem("Not signed in."),
		},
		security: signedIn,
		summary: "Which accounts can be connected to import from",
		tags: ["Profiles"],
	}),
	importLibrary: createRoute({
		description:
			"Adds what another place keeps to the profile: a document from `exportLibrary`, an AniList user's public anime list, or a MyAnimeList `animelist` export. It only adds. A title already on the watchlist keeps its status, an episode already played keeps where it was, and importing the same thing twice changes nothing the second time. From another site, each title is put on the watchlist with its status (on hold and rewatching count as watching) and the episodes up to the ones watched are marked watched; a completed title has every released episode marked. Titles Sora does not hold yet are listed in the report and queued to be added, so importing again later takes them.",
		method: "post",
		operationId: "importLibrary",
		path: "/profiles/{profile_id}/library/import",
		request: {
			body: {
				content: {
					"application/json": {
						schema: LibraryImportSchema,
					},
				},
				required: true,
			},
			params: ProfileParams,
		},
		responses: {
			200: json(envelopeOf(LibraryImportReportSchema, EmptyMetaSchema), "What was added."),
			401: problem("Not signed in."),
			404: problem("The account has no such profile."),
			422: problem("The body is invalid, or the AniList user is unknown or private."),
			503: problem("AniList could not be reached."),
		},
		security: signedIn,
		summary: "Import a watchlist and history",
		tags: ["Profiles"],
	}),
	listImportConnections: createRoute({
		description:
			"The AniList and MyAnimeList accounts the profile connected to import from, with the name each goes by on its site. Sora keeps no access to them: importing again asks the site for a new code.",
		method: "get",
		operationId: "listImportConnections",
		path: "/profiles/{profile_id}/library/connections",
		request: {
			params: ProfileParams,
		},
		responses: {
			200: json(
				envelopeOf(z.array(ImportConnectionSchema), CountMetaSchema),
				"The connected accounts.",
			),
			401: problem("Not signed in."),
			404: problem("The account has no such profile."),
		},
		security: signedIn,
		summary: "List the accounts connected to import from",
		tags: ["Profiles"],
	}),
	undoImport: createRoute({
		description:
			"Takes back what `importLibrary` added: the titles it put on the watchlist and the episodes it marked watched. Only the profile's latest import can be undone, once; any other `import_id` undoes nothing.",
		method: "post",
		operationId: "undoImport",
		path: "/profiles/{profile_id}/library/imports/{import_id}/undo",
		request: {
			params: ProfileParams.extend({
				import_id: z
					.string()
					.min(1)
					.openapi({
						description: "The report's `import_id`.",
						param: {
							in: "path",
							name: "import_id",
						},
					}),
			}),
		},
		responses: {
			200: json(envelopeOf(ImportUndoSchema, EmptyMetaSchema), "What was taken back."),
			401: problem("Not signed in."),
			404: problem("The account has no such profile."),
		},
		security: signedIn,
		summary: "Undo an import",
		tags: ["Profiles"],
	}),
};
