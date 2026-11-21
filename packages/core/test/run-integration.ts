import { fileURLToPath } from "node:url";

import { SQL } from "bun";

const adminUrl = URL.parse(
	process.env.SORA_TEST_ADMIN_URL ?? "postgresql://sora:sora@127.0.0.1:5432/postgres",
);
if (
	adminUrl?.protocol !== "postgresql:" ||
	adminUrl.pathname !== "/postgres" ||
	!adminUrl.hostname ||
	adminUrl.search ||
	adminUrl.hash
) {
	throw new Error("SORA_TEST_ADMIN_URL must be a postgresql:// URL for /postgres without options.");
}

const name = `sora_test_${crypto.randomUUID().replaceAll("-", "")}`;
const databaseUrl = new URL(adminUrl);
databaseUrl.pathname = `/${name}`;
const filters = process.argv.slice(2);

const admin = new SQL({
	connectionTimeout: 5,
	max: 1,
	url: adminUrl.href,
});
let created = false;
let interrupted: "SIGINT" | "SIGTERM" | undefined;
let tests: { kill: (signal: "SIGINT" | "SIGTERM") => void } | undefined;
const interrupt = (signal: "SIGINT" | "SIGTERM") => {
	interrupted = signal;
	tests?.kill(signal);
};
process.on("SIGINT", interrupt);
process.on("SIGTERM", interrupt);

try {
	await admin`create database ${admin(name)} template template0`;
	created = true;
	console.info(`Created integration database ${name}`);
	if (!interrupted) {
		const child = Bun.spawn(
			[
				process.execPath,
				"test",
				"--no-env-file",
				"--env-file=../../.env.test",
				"--preload",
				"./test/setup-integration.ts",
				...(filters.length > 0 ? filters : ["integration.test.ts", "database/client.test.ts"]),
			],
			{
				cwd: fileURLToPath(new URL("..", import.meta.url)),
				env: {
					...process.env,
					DATABASE_URL: databaseUrl.href,
					NODE_ENV: "test",
					SORA_TEST_DATABASE: name,
				},
				stderr: "inherit",
				stdout: "inherit",
			},
		);
		tests = child;
		process.exitCode = await child.exited;
		tests = undefined;
	}
} catch {
	console.error(
		created
			? "Could not run the integration tests."
			: "Could not create the integration database. Check PostgreSQL and the role's CREATEDB permission.",
	);
	process.exitCode = 1;
} finally {
	try {
		if (created) {
			await admin`drop database ${admin(name)} with (force)`;
			console.info(`Dropped integration database ${name}`);
		}
	} catch {
		console.error(`Could not drop integration database ${name}.`);
		process.exitCode = 1;
	} finally {
		await admin.close();
	}
}

if (interrupted && !process.exitCode) {
	process.exitCode = interrupted === "SIGINT" ? 130 : 143;
}
