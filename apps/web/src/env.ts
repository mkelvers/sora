import { building } from "$app/env";
import { defineEnvVars } from "@sveltejs/kit/env";

const requiredWhenStarting = (name: string) => (value: string | undefined) => {
	if (value) {
		return value;
	}
	if (building) {
		return "";
	}
	throw new Error(`${name} is required`);
};

export const variables = defineEnvVars({
	SORA_API_URL: {},
	WEB_CLIENT_KEY: {
		schema: requiredWhenStarting("WEB_CLIENT_KEY"),
	},
});
