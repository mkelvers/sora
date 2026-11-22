import { apiReady, webReady } from "../apps/web/src/lib/server/readiness";

const [service, baseUrl] = process.argv.slice(2);
if ((service !== "api" && service !== "web") || !baseUrl) {
	console.error("Usage: bun run release:check <api|web> <base-url>");
	process.exit(2);
}

if (!(await (service === "api" ? apiReady(baseUrl) : webReady(baseUrl)))) {
	console.error(`${service} readiness check failed`);
	process.exit(1);
}

console.log(`${service} is ready`);
