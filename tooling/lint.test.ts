import { expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

class Fixture {
	readonly #directory = mkdtempSync(path.join(tmpdir(), "sora-lint-"));

	check(source: string, filename = "sample.ts", directives = false) {
		const file = path.join(this.#directory, filename);
		writeFileSync(file, source);

		const args = [path.resolve("node_modules/.bin/oxlint"), "--format", "json"];

		if (directives) {
			args.push("-c", path.resolve("tooling/directives.json"), "--disable-nested-config");
		} else {
			args.push("-c", path.resolve("oxlint.config.ts"));
		}

		args.push(file);

		const result = Bun.spawnSync(args);

		if (result.error) {
			throw result.error;
		}

		return {
			output: result.stdout.toString() + result.stderr.toString(),
			status: result.exitCode,
		};
	}

	[Symbol.dispose]() {
		rmSync(this.#directory, {
			force: true,
			recursive: true,
		});
	}
}

test("assertions fail with and without justification comments", () => {
	using fixture = new Fixture();

	for (const source of [
		"const value = input as string;",
		"// SAFETY: trusted input\nconst value = input as string;",
		"const value = <string>input;",
		"const value = input as unknown as string;",
	]) {
		const result = fixture.check(source);
		expect(result.status).toBe(1);
		expect(result.output).toContain("typescript(consistent-type-assertions)");
	}
});

test("checked assignments, satisfies, and const assertions remain allowed", () => {
	using fixture = new Fixture();

	const result = fixture.check(
		'export const value = "x" as const;\nexport const checked: string = value;\nexport const exact = value satisfies string;',
	);

	expect(result.status).toBe(0);
});

test("format and compiler suppression comments fail", () => {
	using fixture = new Fixture();

	for (const directive of [
		"oxfmt-ignore",
		"prettier-ignore",
		"biome-ignore lint/style: reason",
		"@ts-ignore reason",
		"@ts-nocheck reason",
		"@ts-expect-error reason",
		"svelte-ignore a11y_click_events_have_key_events",
		"@noformat",
	]) {
		const result = fixture.check(`// ${directive}\nexport const value = 1;`);
		expect(result.status).toBe(1);
		expect(result.output).toContain("code-style(no-suppressions)");
	}
});

test("only an isolated, explained negative type test may expect an error", () => {
	using fixture = new Fixture();

	const result = fixture.check(
		"// @ts-expect-error intentionally invalid assignment\nexport const value: string = 1;",
		"sample.test.ts",
	);

	expect(result.status).toBe(0);

	for (const directive of [
		"@ts-expect-error",
		"@ts-expect-error reason prettier-ignore",
		"prettier-ignore @ts-expect-error reason",
	]) {
		const invalid = fixture.check(`// ${directive}\nexport const value = 1;`, "sample.test.ts");
		expect(invalid.status).toBe(1);
		expect(invalid.output).toContain("code-style(no-suppressions)");
	}
});

test("disable directives cannot disable the independent directive check", () => {
	using fixture = new Fixture();

	for (const directive of [
		"/* oxlint-disable */",
		"/* eslint-disable */",
		"/* oxlint-disable code-style/no-suppressions */",
		"/* eslint-disable code-style/no-suppressions */",
		"// oxlint-disable-next-line typescript/consistent-type-assertions",
		"// eslint-disable-next-line typescript/consistent-type-assertions",
	]) {
		const result = fixture.check(`${directive}\nexport const value = 1;`, "sample.ts", true);
		expect(result.status).toBe(1);
		expect(result.output).toContain("Unused");
	}
});

test("Svelte script disable directives cannot hide diagnostics", () => {
	using fixture = new Fixture();

	const result = fixture.check(
		'<script lang="ts">\n/* oxlint-disable code-style/no-suppressions */\nexport const value = 1;\n</script>',
		"sample.svelte",
		true,
	);

	expect(result.status).toBe(1);
	expect(result.output).toContain("Unused");
});
