import { timeZoneCookie } from "$lib/utils";
import { attempt } from "@sora/shared";

import type { PageServerLoad } from "./$types";

function zoneOf(value: string | undefined) {
	if (!value) {
		return "UTC";
	}

	const { data: now, error } = attempt(() => Temporal.Now.zonedDateTimeISO(value), RangeError);
	if (error) {
		return "UTC";
	}
	return now.timeZoneId;
}

export const load: PageServerLoad = async ({ cookies, depends }) => {
	depends("sora:time-zone");

	return {
		timeZone: zoneOf(cookies.get(timeZoneCookie)),
	};
};
