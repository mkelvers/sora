import adapter from "@sveltejs/adapter-node";
import { sveltekit } from "@sveltejs/kit/vite";
import tailwindcss from "@tailwindcss/vite";
import { sveltePhosphorOptimize } from "phosphor-svelte/vite";
import { defineConfig } from "vite";
import type { Plugin } from "vite";

const phosphorWeights: Plugin = {
	enforce: "pre",
	name: "phosphor-weights",
	transform(code, id) {
		if (!/phosphor-svelte\/lib\/\w+\.svelte(?:\?.*)?$/u.test(id)) {
			return;
		}

		return code.replaceAll(
			/\{:else if weight === "(?:thin|light|duotone)"\}[\s\S]*?(?=\{:else)/gu,
			"",
		);
	},
};

export default defineConfig({
	optimizeDeps: {
		exclude: ["phosphor-svelte"],
	},
	plugins: [
		phosphorWeights,
		tailwindcss(),
		sveltekit({
			adapter: adapter({
				precompress: true,
			}),
			alias: {
				$routes: "src/routes",
			},
			compilerOptions: {
				experimental: {
					async: true,
				},
				runes: ({ filename }) =>
					filename.split(/[/\\]/u).includes("node_modules") ? undefined : true,
			},
			csp: {
				directives: {
					"base-uri": ["self"],
					"connect-src": ["self"],
					"default-src": ["self"],
					"font-src": ["self", "data:"],
					"form-action": ["self"],
					"frame-ancestors": ["none"],
					"img-src": ["self", "data:", "blob:", "https://image.tmdb.org", "https://s4.anilist.co"],
					"media-src": ["self", "blob:"],
					"object-src": ["none"],
					"script-src": ["self"],
					"script-src-attr": [
						"unsafe-hashes",
						"sha256-7dQwUgLau1NFCCGjfn9FsYptB6ZtWxJin6VohGIu20I=",
					],
					"style-src": ["self", "unsafe-inline"],
					"worker-src": ["self", "blob:"],
				},
				mode: "auto",
			},
			experimental: {
				remoteFunctions: true,
			},
		}),
		sveltePhosphorOptimize(),
	],
});
