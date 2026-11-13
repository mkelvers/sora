import { command, getRequestEvent } from "$app/server";
import { z } from "zod";

export const setTimeZone = command(z.string().min(1), (zone) => {
	const { cookies, url } = getRequestEvent();
	cookies.set("sora_tz", zone, {
		httpOnly: false,
		maxAge: 31_536_000,
		path: "/",
		sameSite: "lax",
		secure: url.protocol === "https:",
	});
});
