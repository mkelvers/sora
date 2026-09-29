<script lang="ts">
	import { cn, moveMenuFocus } from "$lib/utils";
	import { Popover } from "melt/builders";
	import type { Snippet } from "svelte";

	import Button from "./Button.svelte";

	type Props = {
		children: Snippet;
		trigger: Snippet;
		label?: string;
		alignment?: "left" | "right";
		class?: string;
	};

	let { alignment = "right", children, class: className, label, trigger }: Props = $props();

	const popover = new Popover({
		focus: {
			onOpen: (): string => `#${popover.ids.popover} [aria-checked="true"]`,
		},
		floatingConfig: () => ({
			computePosition: {
				placement: alignment === "left" ? "bottom-start" : "bottom-end",
			},
			offset: 0,
		}),
	});
</script>

<div class="dropdown-root group relative">
	<Button
		{...popover.trigger}
		variant="ghost"
		class="dropdown-trigger group-has-[.dropdown-menu:popover-open]:bg-white/8 group-has-[.dropdown-menu:popover-open]:text-foreground"
		aria-label={label}
	>
		{@render trigger()}
	</Button>

	<div
		{...popover.content}
		class={cn(
			"dropdown-menu inset-auto z-10 m-0 w-56 flex-col overflow-hidden bg-dropdown shadow-lg open:flex",
			className,
		)}
		onpointermove={(event) => {
			const item = (event.target as HTMLElement).closest<HTMLElement>("a, button");
			if (item && item !== document.activeElement) {
				item.focus({
					preventScroll: true,
				});
			}
		}}
		onkeydown={moveMenuFocus}
		onclick={(event) => {
			if ((event.target as HTMLElement).closest("a, button")) {
				popover.open = false;
			}
		}}
	>
		{@render children()}
	</div>
</div>
