import type { HandleClientError } from "@sveltejs/kit/hooks";

export const handleError: HandleClientError = (caught) => {
	if (caught.kind !== "unknown" && caught.error.status === 401) {
		const here = encodeURIComponent(location.pathname + location.search);
		location.assign(`/login?redirect=${here}`);
	}
};
