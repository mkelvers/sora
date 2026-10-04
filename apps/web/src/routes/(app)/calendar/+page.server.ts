import { timeZoneCookie } from "$lib/utils";
import { attempt } from "@sora/shared";

import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ cookies, depends }) => {
	depends("sora:time-zone");

	const { data } = attempt(
		() => Temporal.Now.zonedDateTimeISO(cookies.get(timeZoneCookie) ?? "UTC"),
		RangeError,
	);

	return {
		timeZone: data?.timeZoneId ?? "UTC",
	};
};
