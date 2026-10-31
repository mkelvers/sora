import { and, desc, eq, gt, ne } from "drizzle-orm";

import { db } from "../database/client";
import { authSession } from "../database/schema/auth";
import type { SignedInDevice } from "../models/device";
import { describeDevice, deviceDetails, deviceKind, presentAddress } from "./device";

/**
 * Records what browser the current session is, when the session was signed in
 * before sign-ins recorded one, so it is named from then on. A session whose
 * stored `User-Agent` already names a browser or system is left alone.
 */
const rememberUserAgent = async (
	accountId: string,
	sessionId: string,
	userAgent: string | null,
) => {
	if (!userAgent) {
		return;
	}

	const [current] = await db
		.select({
			userAgent: authSession.userAgent,
		})
		.from(authSession)
		.where(and(eq(authSession.id, sessionId), eq(authSession.userId, accountId)))
		.limit(1);
	if (current && deviceKind(current.userAgent) === "unknown") {
		await db
			.update(authSession)
			.set({
				userAgent,
			})
			.where(and(eq(authSession.id, sessionId), eq(authSession.userId, accountId)));
	}
};

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
	await rememberUserAgent(accountId, currentSessionId, currentUserAgent);
	const rows = await db
		.select()
		.from(authSession)
		.where(and(eq(authSession.userId, accountId), gt(authSession.expiresAt, new Date())))
		.orderBy(desc(authSession.updatedAt));

	return rows.map((row) => ({
		...deviceDetails(row.userAgent),
		current: row.id === currentSessionId,
		device: describeDevice(row.userAgent),
		id: row.id,
		ip_address: presentAddress(row.ipAddress),
		kind: deviceKind(row.userAgent),
		last_active_at: row.updatedAt.toISOString(),
		signed_in_at: row.createdAt.toISOString(),
	}));
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
