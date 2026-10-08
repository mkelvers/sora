<script lang="ts">
	import { cn } from "$lib/utils";
	import type { HTMLInputAttributes } from "svelte/elements";

	let { class: className, value = $bindable(), ...props }: HTMLInputAttributes = $props();
</script>

<input
	{...props}
	bind:value
	class={cn(
		"flex h-11 w-full border border-border bg-transparent px-3 text-base transition-[border-color] duration-150 outline-none placeholder:text-subtle hover:border-border-strong focus-visible:border-accent disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-danger sm:text-sm",
		className,
	)}
/>
