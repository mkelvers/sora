import type { HandleClientError } from "@sveltejs/kit";

export const handleError: HandleClientError = ({ status }) => {
	if (status === 401) {
		const here = encodeURIComponent(location.pathname + location.search);
		location.assign(`/login?redirect=${here}`);
	}
};
