import { and, desc, eq, gt, ne } from "drizzle-orm";

import { db } from "../database/client";
import { authSession } from "../database/schema/auth";
import type { SignedInDevice } from "../models/device";
import { Device, presentAddress } from "./device";

/**
 * The devices an account is signed in on, the one used most recently first:
 * its sessions that have not expired. `currentSessionId` marks the one the
 * request came from.
 */
export const listDevices = async (
	accountId: string,
	currentSessionId: string,
	currentUserAgent: string | null = null,
): Promise<SignedInDevice[]> => {
	// A session signed in before sign-ins recorded a browser is named from then on;
	// one whose stored `User-Agent` already names a browser or system is left alone.
	if (currentUserAgent) {
		const [current] = await db
			.select({
				userAgent: authSession.userAgent,
			})
			.from(authSession)
			.where(and(eq(authSession.id, currentSessionId), eq(authSession.userId, accountId)))
			.limit(1);

		if (current && new Device(current.userAgent).kind === "unknown") {
			await db
				.update(authSession)
				.set({
					userAgent: currentUserAgent,
				})
				.where(and(eq(authSession.id, currentSessionId), eq(authSession.userId, accountId)));
		}
	}

	const rows = await db
		.select()
		.from(authSession)
		.where(and(eq(authSession.userId, accountId), gt(authSession.expiresAt, new Date())))
		.orderBy(desc(authSession.updatedAt));

	return rows.map((row) => {
		const device = new Device(row.userAgent);

		return {
			...device.details,
			current: row.id === currentSessionId,
			device: device.name,
			id: row.id,
			ip_address: presentAddress(row.ipAddress),
			kind: device.kind,
			last_active_at: row.updatedAt.toISOString(),
			signed_in_at: row.createdAt.toISOString(),
		};
	});
};

/** Signs one of an account's devices out. Another account's session, or one already gone, is left alone. */
export const signOutDevice = async (accountId: string, sessionId: string) => {
	await db
		.delete(authSession)
		.where(and(eq(authSession.id, sessionId), eq(authSession.userId, accountId)));
};

/** Signs every device of an account out but the one the request came from. */
export const signOutOtherDevices = async (accountId: string, currentSessionId: string) => {
	await db
		.delete(authSession)
		.where(and(eq(authSession.userId, accountId), ne(authSession.id, currentSessionId)));
};
