/**
 * Creates an account, as signing up is turned off:
 * `bun run auth:create-account <email> <name>`.
 *
 * Asks for the password without echoing it, so it stays out of the terminal
 * and shell history. It is hashed the way Better Auth hashes it on sign-up,
 * and the account gets its first profile, named after it, from the same hook
 * sign-up runs.
 */
import { createInterface } from "node:readline/promises";
import { Writable } from "node:stream";

import { z } from "zod";

import { closeDatabase } from "../database/client";
import { auth } from "./auth";

const [email, name] = process.argv.slice(2);
const Input = z.object({
	email: z.email(),
	name: z.string().trim().min(1).max(40),
});

const input = Input.safeParse({
	email: email?.trim().toLowerCase(),
	name,
});
if (!input.success) {
	console.error("Usage: bun run auth:create-account <email> <name>");
	process.exit(1);
}

if (!process.stdin.isTTY || !process.stdout.isTTY) {
	console.error("Run this command in an interactive terminal to enter a hidden password.");
	process.exit(1);
}

const context = await auth.$context;

if (await context.internalAdapter.findUserByEmail(input.data.email)) {
	console.error(`${input.data.email} already has an account.`);
	process.exit(1);
}

// Readline handles editing, but its output is discarded so typed characters stay hidden.
const output = new Writable({
	write(_chunk, _encoding, callback) {
		callback();
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
const password = await reader
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
		email: input.data.email,
		name: input.data.name,
		emailVerified: true,
	},
	{
		method: "email-password",
	},
);
await context.internalAdapter.linkAccount({
	userId: user.id,
	providerId: "credential",
	accountId: user.id,
	password: await context.password.hash(password),
});

console.log(`Created ${user.email}.`);
await closeDatabase();
