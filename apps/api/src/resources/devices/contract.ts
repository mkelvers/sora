import { createRoute, z } from "@hono/zod-openapi";
import { SignedInDeviceSchema } from "@sora/core/models/device";

import { CountMetaSchema, envelopeOf } from "../../openapi/envelope";
import { json, problem, signedIn } from "../../openapi/schemas";

/** The devices signed in to the account. */
export const deviceRoute = {
	listDevices: createRoute({
		description:
			"The devices the account is signed in on, the one used most recently first. A device is a sign-in: signing in again on the same browser adds another. `last_active_at` is kept up to a day behind.",
		method: "get",
		operationId: "listDevices",
		path: "/devices",
		responses: {
			200: json(envelopeOf(z.array(SignedInDeviceSchema), CountMetaSchema), "The devices."),
			401: problem("Not signed in."),
		},
		security: signedIn,
		summary: "List the devices the account is signed in on",
		tags: ["Account"],
	}),
	signOutDevice: createRoute({
		description:
			"Ends the sign-in of one device, which has to sign in again. Signing out the device the request came from is the same as signing out. An ID that is not the account's, or is already gone, does nothing.",
		method: "delete",
		operationId: "signOutDevice",
		path: "/devices/{device_id}",
		request: {
			params: z.object({
				device_id: z.string().meta({
					description: "A device's `id`, from `listDevices`.",
				}),
			}),
		},
		responses: {
			204: {
				description: "Signed out, or was not signed in.",
			},
			401: problem("Not signed in."),
		},
		security: signedIn,
		summary: "Sign a device out",
		tags: ["Account"],
	}),
	signOutOtherDevices: createRoute({
		description:
			"Ends every sign-in of the account but the one the request came from, as after losing a phone.",
		method: "delete",
		operationId: "signOutOtherDevices",
		path: "/devices",
		responses: {
			204: {
				description: "Every other device is signed out.",
			},
			401: problem("Not signed in."),
		},
		security: signedIn,
		summary: "Sign every other device out",
		tags: ["Account"],
	}),
};
