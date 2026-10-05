import adapter from "@sveltejs/adapter-node";
import type { Config } from "@sveltejs/kit";
import { sveltekit } from "@sveltejs/kit/vite";
import tailwindcss from "@tailwindcss/vite";
import { sveltePhosphorOptimize } from "phosphor-svelte/vite";
import { defineConfig, loadEnv, type Plugin } from "vite";

type CspSource = NonNullable<
	NonNullable<NonNullable<Config["kit"]>["csp"]>["directives"]
>["connect-src"] extends (infer Source)[] | undefined
	? Source
	: never;

const phosphorWeights: Plugin = {
	name: "phosphor-weights",
	enforce: "pre",
	transform(code, id) {
		if (!/phosphor-svelte\/lib\/\w+\.svelte(?:\?.*)?$/.test(id)) {
			return;
		}

		return code.replace(/\{:else if weight === "(?:thin|light|duotone)"\}[\s\S]*?(?=\{:else)/g, "");
	},
};

export default defineConfig(({ mode }) => {
	const apiUrl = loadEnv(mode, process.cwd(), "").SORA_API_URL;
	const apiOrigin = apiUrl ? [new URL(apiUrl).origin as CspSource] : [];

	return {
		plugins: [
			phosphorWeights,
			tailwindcss(),
			sveltekit({
				compilerOptions: {
					runes: ({ filename }) =>
						filename.split(/[/\\]/).includes("node_modules") ? undefined : true,
					experimental: {
						async: true,
					},
				},
				experimental: {
					remoteFunctions: true,
				},
				adapter: adapter(),
				alias: {
					$routes: "src/routes",
				},
				csp: {
					mode: "auto",
					directives: {
						"default-src": ["self"],
						"script-src": ["self"],
						"script-src-attr": [
							"unsafe-hashes",
							"sha256-7dQwUgLau1NFCCGjfn9FsYptB6ZtWxJin6VohGIu20I=",
						],
						"style-src": ["self", "unsafe-inline"],
						"img-src": ["self", "data:", "blob:", "https:"],
						"font-src": ["self", "data:"],
						"media-src": ["self", "blob:", ...apiOrigin],
						"connect-src": ["self", ...apiOrigin],
						"worker-src": ["self", "blob:"],
						"object-src": ["none"],
						"base-uri": ["self"],
						"form-action": ["self"],
						"frame-ancestors": ["none"],
					},
				},
			}),
			sveltePhosphorOptimize(),
		],
		optimizeDeps: {
			exclude: ["phosphor-svelte"],
		},
	};
});
