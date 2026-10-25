import { defineEnvVars } from "@sveltejs/kit/env";

export const variables = defineEnvVars({
	SORA_API_URL: {},
	WEB_CLIENT_KEY: {},
});
