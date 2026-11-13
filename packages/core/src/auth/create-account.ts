/**
 * Creates an account, as signing up is turned off:
 * `bun run auth:create-account <username>`.
 *
 * Asks for the password without echoing it, so it stays out of the terminal
 * and shell history. With `--password-stdin`, it reads the password from the
 * first line of standard input instead, for scripts such as the installer,
 * which have no terminal to ask in; the password still never appears in the
 * command line or the environment. It is hashed the way Better Auth hashes it
 * on sign-up, and the account gets its first profile, named after it, from
 * the same hook sign-up runs.
 */
import { createInterface } from "node:readline/promises";
import { Writable } from "node:stream";

import { z } from "zod";

import { closeDatabase } from "../database/client";
import { auth } from "./auth";

const passwordStdinFlag = "--password-stdin";
const options = process.argv.slice(2);
const isPasswordFromStdin = options.includes(passwordStdinFlag);
const [username, ...rest] = options.filter((option) => option !== passwordStdinFlag);
const Input = z.object({
	username: z
		.string()
		.trim()
		.regex(/^[a-zA-Z0-9_.]{3,30}$/u),
});

const input = Input.safeParse({
	username,
});
if (!input.success || rest.length > 0) {
	console.error(`Usage: bun run auth:create-account <username> [${passwordStdinFlag}]`);
	process.exit(1);
}

if (!isPasswordFromStdin && (!process.stdin.isTTY || !process.stdout.isTTY)) {
	console.error(
		`Run this command in an interactive terminal to enter a hidden password, or pass ${passwordStdinFlag}.`,
	);
	process.exit(1);
}

const context = await auth.$context;

const normalized = input.data.username.toLowerCase();
const email = `${normalized}@sora.invalid`;
if (await context.internalAdapter.findUserByEmail(email)) {
	console.error(`${input.data.username} already has an account.`);
	process.exit(1);
}

/** The first line of standard input, or `null` when it ends before one. */
const readPasswordFromStdin = async () => {
	const reader = createInterface({
		crlfDelay: Number.POSITIVE_INFINITY,
		input: process.stdin,
	});
	const first = await reader[Symbol.asyncIterator]().next();
	reader.close();
	return first.done === true ? null : first.value;
};

/** Asks for the password in the terminal without echoing it, or `null` when cancelled. */
const askPassword = async () => {
	// Readline handles editing, but its output is discarded so typed characters stay hidden.
	const output = new Writable({
		write(_chunk, _encoding, finish) {
			finish();
		},
	});
	const reader = createInterface({
		input: process.stdin,
		output,
		terminal: true,
	});
	const controller = new AbortController();
	reader.once("SIGINT", () => controller.abort());
	reader.once("close", () => controller.abort());
	process.stdout.write("Password: ");
	return await reader
		.question("", {
			signal: controller.signal,
		})
		.catch((error) => {
			if (!controller.signal.aborted) {
				throw error;
			}
			return null;
		})
		.finally(() => {
			reader.close();
			output.destroy();
			process.stdout.write("\n");
		});
};

const password = isPasswordFromStdin ? await readPasswordFromStdin() : await askPassword();
if (password === null) {
	console.error("Account creation cancelled.");
	await closeDatabase();
	process.exit(1);
}
const { minPasswordLength, maxPasswordLength } = context.password.config;
if (password.length < minPasswordLength || password.length > maxPasswordLength) {
	console.error(`The password must be ${minPasswordLength}–${maxPasswordLength} characters.`);
	process.exit(1);
}

const user = await context.internalAdapter.createUser(
	{
		displayUsername: input.data.username,
		email,
		emailVerified: true,
		name: input.data.username,
		username: normalized,
	},
	{
		method: "email-password",
	},
);
await context.internalAdapter.linkAccount({
	accountId: user.id,
	password: await context.password.hash(password),
	providerId: "credential",
	userId: user.id,
});

console.log(`Created ${input.data.username}.`);
await closeDatabase();
