<script lang="ts">
	import { cn } from "$lib/utils";
	import type { Snippet } from "svelte";
	import type { HTMLInputAttributes } from "svelte/elements";

	type Props = Omit<HTMLInputAttributes, "type" | "checked" | "children" | "role"> & {
		checked?: boolean;
		role?: "switch" | "menuitemcheckbox";
		children: Snippet;
	};

	let {
		checked = $bindable(false),
		role = "switch",
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
	<span
		class="flex flex-1 items-center peer-disabled:cursor-not-allowed peer-disabled:opacity-50 after:ml-auto after:h-5 after:w-9 after:shrink-0 after:border-2 after:border-muted after:bg-[linear-gradient(currentColor,currentColor)] after:bg-size-[0.75rem_0.75rem] after:bg-position-[left_0.125rem_center] after:bg-no-repeat after:text-muted after:transition-[background-position,border-color,color] after:duration-150 peer-checked:after:border-accent peer-checked:after:bg-position-[right_0.125rem_center] peer-checked:after:text-accent peer-focus-visible:after:outline-2 peer-focus-visible:after:outline-offset-2 peer-focus-visible:after:outline-accent"
	>
		{@render children()}
	</span>
</label>
