import { expect, test } from "bun:test";
import { fileURLToPath } from "node:url";

const sharedUrl = "postgresql://127.0.0.1:1/sora";
const name = "sora_test_00000000000000000000000000000000";
const cwd = fileURLToPath(new URL("..", import.meta.url));

test("unit test setup overrides an inherited application database URL", async () => {
	const result = Bun.spawn(
		[
			process.execPath,
			"--no-env-file",
			"--preload",
			"./test/setup.ts",
			"-e",
			"console.log(new URL(process.env.DATABASE_URL).pathname)",
		],
		{
			cwd,
			env: {
				...process.env,
				DATABASE_URL: sharedUrl,
				SORA_TEST_DATABASE: name,
			},
			stdout: "pipe",
		},
	);

	const [status, stdout] = await Promise.all([result.exited, result.stdout.text()]);
	expect(status).toBe(0);
	expect(stdout.trim()).toBe("/sora_unit_tests");
});

test.each([sharedUrl, `postgresql://127.0.0.1:1/${name}?dbname=sora`])(
	"rejects unsafe integration database URL %s before connecting",
	async (databaseUrl) => {
		const result = Bun.spawn(
			[
				process.execPath,
				"test",
				"--no-env-file",
				"--preload",
				"./test/setup-integration.ts",
				"database/client.test.ts",
			],
			{
				cwd,
				env: {
					...process.env,
					DATABASE_URL: databaseUrl,
					SORA_TEST_DATABASE: name,
				},
				stderr: "pipe",
			},
		);

		const [status, stderr] = await Promise.all([result.exited, result.stderr.text()]);
		expect(status).toBe(1);
		expect(stderr).toContain(
			"Integration tests require a disposable database from test:integration.",
		);
	},
);

test("refuses to provision integration databases through the shared app database", async () => {
	const result = Bun.spawn([process.execPath, "--no-env-file", "test/run-integration.ts"], {
		cwd,
		env: {
			...process.env,
			SORA_TEST_ADMIN_URL: sharedUrl,
		},
		stderr: "pipe",
	});

	const [status, stderr] = await Promise.all([result.exited, result.stderr.text()]);
	expect(status).toBe(1);
	expect(stderr).toContain("SORA_TEST_ADMIN_URL must be a postgresql:// URL for /postgres");
});
