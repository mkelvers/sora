import { fileURLToPath } from "node:url";

import adapter from "@sveltejs/adapter-node";
import { sveltekit } from "@sveltejs/kit/vite";
import tailwindcss from "@tailwindcss/vite";
import { sveltePhosphorOptimize } from "phosphor-svelte/vite";
import { defineConfig } from "vite";
import type { Plugin } from "vite";

export default defineConfig({
	optimizeDeps: {
		exclude: ["phosphor-svelte"],
	},
	plugins: [
		{
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
		} satisfies Plugin,
		tailwindcss(),
		sveltekit({
			adapter: adapter({
				precompress: true,
			}),
			compilerOptions: {
				experimental: {
					async: true,
				},
				runes: ({ filename }) => {
					if (filename.split(/[/\\]/u).includes("node_modules")) {
						return;
					}

					return true;
				},
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
	resolve: {
		alias: {
			$lib: fileURLToPath(new URL("src/lib", import.meta.url)),
			$routes: fileURLToPath(new URL("src/routes", import.meta.url)),
		},
	},
});
