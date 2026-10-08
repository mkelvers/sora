import { expect, test } from "bun:test";

test("generates route documentation when core schemas load before OpenAPI", () => {
	// A fresh process keeps other tests from initializing the Zod extension first.
	const result = Bun.spawnSync({
		cmd: [
			process.execPath,
			"-e",
			`
			await import("@sora/core/contract");
			const { OpenAPIHono } = await import("@hono/zod-openapi");
			const routes = await import("./routes.ts");
			const app = new OpenAPIHono();
			for (const route of Object.values(routes)) {
				app.openAPIRegistry.registerPath(route);
			}
			const document = app.getOpenAPI31Document({
				openapi: "3.1.0",
				info: { title: "Sora", version: "1" },
			});
			console.log(JSON.stringify(document));
			`,
		],
		cwd: import.meta.dir,
	});

	expect(result.stderr.toString()).toBe("");
	expect(result.exitCode).toBe(0);
	const document = JSON.parse(result.stdout.toString());
	const current =
		document.paths["/seasons"].get.responses["200"].content["application/json"].schema.properties
			.meta.allOf[1].properties.current;
	expect(current.description).toBe("The season airing now.");
	expect(document.components.schemas.AnimeSeason.properties.season.enum).toEqual([
		"WINTER",
		"SPRING",
		"SUMMER",
		"FALL",
	]);
	expect(document.paths["/search"].get.parameters).toContainEqual(
		expect.objectContaining({
			name: "q",
			schema: expect.objectContaining({
				description: "The text to search titles for.",
			}),
		}),
	);
});
