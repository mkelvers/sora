<script lang="ts">
	import { cn } from "$lib/utils";
	import type { Snippet } from "svelte";

	let {
		label,
		description,
		controlId,
		stacked = false,
		children,
	}: {
		label: string;
		description: string;
		/** The ID of the control, so clicking the label works it. */
		controlId?: string;
		/** Puts a wide control, such as a select, under the text on small screens. */
		stacked?: boolean;
		children: Snippet<[{ describedby: string }]>;
	} = $props();

	const id = $props.id();
</script>

<div
	class={cn(
		"flex justify-between gap-6",
		stacked ? "max-sm:flex-col max-sm:gap-3 sm:items-start" : "items-start",
	)}
>
	<div class="max-w-md min-w-0">
		{#if controlId}
			<label for={controlId} class="block cursor-pointer text-base leading-6 font-semibold">
				{label}
			</label>
		{:else}
			<p class="text-base leading-6 font-semibold">{label}</p>
		{/if}
		<p id="{id}-description" class="mt-1 text-sm leading-relaxed text-muted">{description}</p>
	</div>
	<div class={cn("shrink-0", stacked && "max-sm:w-full")}>
		{@render children({ describedby: `${id}-description` })}
	</div>
</div>
