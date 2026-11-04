import type { HandleClientError } from "@sveltejs/kit/hooks";
import { z } from "zod";

// Skip runtime code generation and its capability probe under the site's CSP.
z.config({ jitless: true });

export const handleError: HandleClientError = (caught) => {
	if (caught.kind === "unknown") {
		return;
	}

	const here = encodeURIComponent(location.pathname + location.search);
	if (caught.error.status === 401) {
		location.assign(`/login?redirect=${here}`);
	}
	if (caught.error.status === 403 && caught.error.message === "Choose a profile first") {
		location.assign(`/profiles?redirect=${here}`);
	}
};
