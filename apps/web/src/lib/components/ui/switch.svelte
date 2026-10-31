<script lang="ts">
	import { cn } from "$lib/utils";
	import { CheckIcon, XIcon } from "phosphor-svelte";
	import type { Snippet } from "svelte";
	import type { HTMLInputAttributes } from "svelte/elements";

	type Props = Omit<HTMLInputAttributes, "type" | "checked" | "children" | "role"> & {
		checked?: boolean;
		role?: "switch" | "menuitemcheckbox";
		/** Draws a cross on the thumb when off and a check when on, for settings pages. */
		icons?: boolean;
		children: Snippet;
	};

	let {
		checked = $bindable(false),
		role = "switch",
		icons = false,
		class: className,
		children,
		onkeydown,
		...props
	}: Props = $props();
</script>

<label class={cn("flex cursor-pointer items-center gap-4", className)}>
	<input
		{...props}
		type="checkbox"
		{role}
		aria-checked={checked}
		class="peer sr-only"
		bind:checked
		onkeydown={(event) => {
			onkeydown?.(event);
			if (event.key === "Enter" && !event.defaultPrevented) {
				event.preventDefault();
				checked = !checked;
			}
		}}
	/>
	<span class="flex-1 peer-disabled:cursor-not-allowed peer-disabled:opacity-50">
		{@render children()}
	</span>
	<span
		aria-hidden="true"
		class={cn(
			"relative shrink-0 rounded-full border-2 border-muted text-muted transition-colors duration-150 peer-checked:border-accent-secondary peer-checked:text-accent-secondary peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent peer-disabled:opacity-50",
			icons ? "h-6 w-11" : "h-5 w-9",
		)}
	>
		<span
			class={cn(
				"absolute top-1/2 left-0.5 grid -translate-y-1/2 place-items-center rounded-full bg-current transition-transform duration-150 motion-reduce:transition-none",
				icons
					? "size-4 [input:checked~span>&]:translate-x-5"
					: "size-3 [input:checked~span>&]:translate-x-4",
			)}
		>
			{#if icons}
				{#if checked}
					<CheckIcon size="0.625rem" weight="bold" class="text-canvas" />
				{:else}
					<XIcon size="0.625rem" weight="bold" class="text-canvas" />
				{/if}
			{/if}
		</span>
	</span>
</label>
