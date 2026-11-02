import type { HandleClientError } from "@sveltejs/kit/hooks";
import { z } from "zod";

// Skip runtime code generation and its capability probe under the site's CSP.
z.config({ jitless: true });

export const handleError: HandleClientError = (caught) => {
	if (caught.kind !== "unknown" && caught.error.status === 401) {
		const here = encodeURIComponent(location.pathname + location.search);
		location.assign(`/login?redirect=${here}`);
	}
};
