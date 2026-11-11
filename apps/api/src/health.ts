import type { FailingJobs } from "@sora/core/models/scheduler";
import { getProviderHealth } from "@sora/core/playback";
import type { ProviderHealth } from "@sora/core/playback";
import { getFailingJobs } from "@sora/core/scheduler/failures";
import { attempt } from "@sora/shared";
import { Hono } from "hono";

/** Reads one part of the signed-in report, or `null` with a warning when it cannot be read. */
const read = async <TData>(what: string, load: () => Promise<TData>) => {
	const { data, error } = await attempt(load());
	if (error) {
		console.warn(`Could not read ${what}: ${error.message}`);
		return null;
	}
	return data;
};

/**
 * `/health`: always `200` with `status: "ok"` while the process serves
 * requests, so load balancers keep it in rotation. Requests from a signed-in
 * account also get how each stream provider has been doing and which
 * scheduler tasks have failing jobs; everyone else gets the status alone, as
 * provider names, timings and tasks are nobody else's business.
 *
 * Neither failing providers nor failing jobs make the API unhealthy:
 * playback falls back to other providers, the scheduler runs elsewhere, and
 * taking instances out of rotation would fix neither. `providers` and
 * `failing_jobs` are each `null` when they cannot be read.
 *
 * Both are read on every signed-in request, uncached: each is one small
 * aggregate query, and anonymous probes read neither.
 *
 * Errors are reported by time or count only: their messages come from
 * scrapers and upstream APIs and can quote upstream URLs and pages. They are
 * in `provider_calls`, graphile-worker's `jobs` view and the scheduler's
 * warnings.
 */
export const healthRoutes = ({
	failingJobs = getFailingJobs,
	providers = getProviderHealth,
	signedIn = () => Promise.resolve(false),
}: {
	/** Reads the scheduler's failing jobs per task. */
	failingJobs?: () => Promise<FailingJobs[]>;
	/** Reads the providers' health. */
	providers?: () => Promise<ProviderHealth[]>;
	/** Whether a request's headers carry a session. */
	signedIn?: (headers: Headers) => Promise<boolean>;
} = {}) =>
	new Hono().get("/", async (c) => {
		if (!(await signedIn(c.req.raw.headers))) {
			return c.json({
				status: "ok",
			});
		}

		const [health, jobs] = await Promise.all([
			read("provider health", providers),
			read("failing scheduler jobs", failingJobs),
		]);
		return c.json({
			failing_jobs: jobs,
			providers: health?.map(({ last_error: _lastError, ...provider }) => provider) ?? null,
			status: "ok",
		});
	});
