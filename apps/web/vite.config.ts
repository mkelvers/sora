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
			adapter: adapter(),
		}),
		sveltePhosphorOptimize(),
	],
	optimizeDeps: {
		exclude: ["phosphor-svelte"],
	},
});
