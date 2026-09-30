import { timeZoneCookie } from "$lib/utils";

import type { PageServerLoad } from "./$types";

function zoneOf(value: string | undefined) {
	try {
		return value ? Temporal.Now.zonedDateTimeISO(value).timeZoneId : "UTC";
	} catch {
		return "UTC";
	}
}

export const load: PageServerLoad = async ({ cookies, depends }) => {
	depends("sora:time-zone");

	return {
		timeZone: zoneOf(cookies.get(timeZoneCookie)),
	};
};
