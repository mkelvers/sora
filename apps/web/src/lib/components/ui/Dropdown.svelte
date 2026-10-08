<script lang="ts">
	import { cn, moveMenuFocus } from "$lib/utils";
	import { Popover } from "melt/builders";
	import type { Snippet } from "svelte";

	import Button from "./Button.svelte";

	let {
		alignment = "right",
		variant = "ghost",
		square = false,
		children,
		class: className,
		label,
		trigger,
	}: {
		children: Snippet;
		trigger: Snippet;
		label?: string;
		alignment?: "left" | "right";
		variant?: "ghost" | "icon" | "secondary" | "toolbar" | "text" | "nav";
		square?: boolean;
		class?: string;
	} = $props();

	const popover = new Popover({
		focus: {
			onOpen: null,
			onClose: null,
		},
		onOpenChange: (open) => {
			if (!open) {
				return;
			}

			setTimeout(() =>
				document
					.querySelector<HTMLElement>(`#${popover.ids.popover} [aria-checked="true"]`)
					?.focus({
						preventScroll: true,
					}),
			);
		},
		floatingConfig: () => ({
			computePosition: {
				placement: alignment === "left" ? "bottom-start" : "bottom-end",
			},
			offset: 0,
			flip: {
				mainAxis: false,
			},
		}),
	});
</script>

<div class={cn("relative", variant === "nav" && "h-full")}>
	<Button {...popover.trigger} {variant} {square} aria-expanded={popover.open} aria-label={label}>
		{@render trigger()}
	</Button>

	<div
		{...popover.content}
		class={cn(
			"inset-auto z-10 m-0 w-56 flex-col overflow-hidden bg-raised shadow-lg open:flex",
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
