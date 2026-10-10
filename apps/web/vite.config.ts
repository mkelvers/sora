import adapter from "@sveltejs/adapter-node";
import { sveltekit } from "@sveltejs/kit/vite";
import tailwindcss from "@tailwindcss/vite";
import { sveltePhosphorOptimize } from "phosphor-svelte/vite";
import { defineConfig, type Plugin } from "vite";

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

export default defineConfig({
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
			adapter: adapter({
				precompress: true,
			}),
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
					"img-src": ["self", "data:", "blob:", "https://image.tmdb.org", "https://s4.anilist.co"],
					"font-src": ["self", "data:"],
					"media-src": ["self", "blob:"],
					"connect-src": ["self"],
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
});
