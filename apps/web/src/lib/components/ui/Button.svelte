<script lang="ts">
	import { cn } from "$lib/utils";
	import type { Snippet } from "svelte";
	import type { HTMLButtonAttributes } from "svelte/elements";

	let {
		class: className,
		type = "button",
		children,
		variant = "default",
		...props
	}: HTMLButtonAttributes & {
		variant?: "default" | "ghost";
		children?: Snippet;
	} = $props();
</script>

<button
	class={cn(
		"group/button inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 text-sm font-medium whitespace-nowrap transition-colors outline-none select-none focus-visible:ring-1 focus-visible:ring-white/30 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:cursor-not-allowed aria-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0",
		variant === "ghost" && "bg-transparent hover:bg-dropdown-hover",
		className,
	)}
	{type}
	{...props}
>
	{@render children?.()}
</button>
