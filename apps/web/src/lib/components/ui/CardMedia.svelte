<script lang="ts">
	import { cn } from "$lib/utils";
	import { cva } from "class-variance-authority";
	import type { Snippet } from "svelte";

	const mediaVariants = cva("relative overflow-hidden bg-surface", {
		variants: {
			aspect: {
				poster: "aspect-2/3",
				video: "aspect-video",
			},
		},
		defaultVariants: {
			aspect: "poster",
		},
	});

	interface Props {
		children: Snippet;
		aspect?: "poster" | "video";
		class?: string;
	}

	let { children, aspect = "poster", class: className }: Props = $props();
</script>

<div class={cn(mediaVariants({ aspect }), className)}>
	{@render children()}
</div>
