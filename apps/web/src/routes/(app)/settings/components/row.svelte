<script lang="ts">
	import type { Snippet } from "svelte";

	let {
		label,
		description,
		controlId,
		children,
	}: {
		label: string;
		description: string;
		/** The ID of the control, so clicking the label works it. */
		controlId?: string;
		children: Snippet<[{ describedby: string }]>;
	} = $props();

	const id = $props.id();
</script>

<div class="flex items-start justify-between gap-6">
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
	<div class="shrink-0">
		{@render children({ describedby: `${id}-description` })}
	</div>
</div>
