import { and, desc, eq, gt, ne } from "drizzle-orm";

import { db } from "../database/client";
import { session } from "../database/schema/auth";
import type { SignedInDevice } from "../models/account";
import { Device, presentAddress } from "./device";

export const devices = {
	/**
	 * The devices an account is signed in on, the one used most recently first:
	 * its sessions that have not expired. `currentSessionId` marks the one the
	 * request came from.
	 */
	async list(
		accountId: string,
		currentSessionId: string,
		currentUserAgent: string | null = null,
	): Promise<SignedInDevice[]> {
		// A session signed in before sign-ins recorded a browser is named from then on;
		// one whose stored `User-Agent` already names a browser or system is left alone.
		if (currentUserAgent) {
			const [current] = await db
				.select({
					userAgent: session.userAgent,
				})
				.from(session)
				.where(and(eq(session.id, currentSessionId), eq(session.userId, accountId)))
				.limit(1);

			if (current && new Device(current.userAgent).kind === "unknown") {
				await db
					.update(session)
					.set({
						userAgent: currentUserAgent,
					})
					.where(and(eq(session.id, currentSessionId), eq(session.userId, accountId)));
			}
		}

		const rows = await db
			.select()
			.from(session)
			.where(and(eq(session.userId, accountId), gt(session.expiresAt, new Date())))
			.orderBy(desc(session.updatedAt));

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
	},

	/** Signs one of an account's devices out. Another account's session, or one already gone, is left alone. */
	async signOut(accountId: string, sessionId: string) {
		await db.delete(session).where(and(eq(session.id, sessionId), eq(session.userId, accountId)));
	},

	/** Signs every device of an account out but the one the request came from. */
	async signOutOthers(accountId: string, currentSessionId: string) {
		await db
			.delete(session)
			.where(and(eq(session.userId, accountId), ne(session.id, currentSessionId)));
	},
};
