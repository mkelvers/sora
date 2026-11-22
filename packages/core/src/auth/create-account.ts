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
import { z } from "zod";

import { db } from "../database/client";
import { auth } from "./auth";
import { Prompt } from "./prompt";

const passwordStdinFlag = "--password-stdin";
const options = process.argv.slice(2);
const fromStdin = options.includes(passwordStdinFlag);
const [username, ...rest] = options.filter((option) => option !== passwordStdinFlag);

const input = z
	.object({
		username: z
			.string()
			.trim()
			.regex(/^[a-zA-Z0-9_.]{3,30}$/u),
	})
	.safeParse({
		username,
	});

if (!input.success || rest.length > 0) {
	console.error(`Usage: bun run auth:create-account <username> [${passwordStdinFlag}]`);
	process.exit(1);
}

if (!fromStdin && ![process.stdin, process.stdout].every((stream) => stream.isTTY)) {
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

const password = await new Prompt(process.stdin, process.stdout).password(fromStdin);

if (password === null) {
	console.error("Account creation cancelled.");
	await db.$client.close();
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

await db.$client.close();
