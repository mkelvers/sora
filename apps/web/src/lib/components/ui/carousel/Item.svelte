<script lang="ts">
	import { cn } from "$lib/utils";
	import type { Snippet } from "svelte";
	import type { HTMLAttributes } from "svelte/elements";

	let {
		children,
		class: className,
		...rest
	}: HTMLAttributes<HTMLDivElement> & {
		children: Snippet;
	} = $props();
</script>

<div
	role="group"
	aria-roledescription="slide"
	class={cn("min-w-0 shrink-0 grow-0 basis-full", className)}
	{...rest}
>
	{@render children()}
</div>
