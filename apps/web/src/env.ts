import { building } from "$app/env";
import { defineEnvVars } from "@sveltejs/kit/env";

export const variables = defineEnvVars({
	SORA_API_URL: {},
	WEB_CLIENT_KEY: {
		schema: (value: string | undefined) => {
			if (value) {
				return value;
			}

			if (building) {
				return "";
			}

			throw new Error("WEB_CLIENT_KEY is required");
		},
	},
});
