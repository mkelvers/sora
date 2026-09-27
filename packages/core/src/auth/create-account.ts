/**
 * Creates an account, as signing up is turned off:
 * `bun run auth:create-account <email> <name>`.
 *
 * Asks for the password, so it stays out of the shell history. The password
 * is hashed the way Better Auth hashes it on sign-up, and the account gets
 * its first profile, named after it, from the same hook sign-up runs.
 */
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

const context = await auth.$context;

if (await context.internalAdapter.findUserByEmail(input.data.email)) {
  console.error(`${input.data.email} already has an account.`);
  process.exit(1);
}

const password = prompt("Password:")?.trim() ?? "";
const {
  minPasswordLength,
  maxPasswordLength,
} = context.password.config;
if (password.length < minPasswordLength || password.length > maxPasswordLength) {
  console.error(`The password must be ${minPasswordLength}–${maxPasswordLength} characters.`);
  process.exit(1);
}

const user = await context.internalAdapter.createUser({
  email: input.data.email,
  name: input.data.name,
  emailVerified: true,
}, {
  method: "email-password",
});
await context.internalAdapter.linkAccount({
  userId: user.id,
  providerId: "credential",
  accountId: user.id,
  password: await context.password.hash(password),
});

console.log(`Created ${user.email}.`);
await closeDatabase();
