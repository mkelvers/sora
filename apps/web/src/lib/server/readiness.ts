import { z } from "zod";

const Ready = z.object({
	status: z.literal("ready"),
});
const ReadyApi = Ready.extend({
	api_versions: z.array(z.number().int().positive()),
});
const ReadyWeb = Ready.extend({
	service: z.literal("web"),
});

const apiTimeoutMs = 2000;
const requiredApiVersion = 1;

const readReadiness = async (baseUrl: string, timeoutMs: number): Promise<unknown> => {
	try {
		const response = await fetch(`${baseUrl.replace(/\/+$/u, "")}/ready`, {
			redirect: "manual",
			signal: AbortSignal.timeout(timeoutMs),
		});
		if (response.status !== 200) {
			await response.body?.cancel();
			return null;
		}
		return await response.json();
	} catch {
		return null;
	}
};

/** Checks that the runtime API URL serves the contract this web build uses. */
export const apiReady = async (baseUrl: string): Promise<boolean> => {
	const parsed = ReadyApi.safeParse(await readReadiness(baseUrl, apiTimeoutMs));
	return parsed.success && parsed.data.api_versions.includes(requiredApiVersion);
};

/** Checks web readiness with time for the web server's own API probe. */
export const webReady = async (baseUrl: string): Promise<boolean> =>
	ReadyWeb.safeParse(await readReadiness(baseUrl, 3000)).success;
