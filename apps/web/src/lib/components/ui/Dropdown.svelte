<script lang="ts">
	import { cn } from "$lib/utils";
	import { Popover } from "melt/builders";
	import type { Snippet } from "svelte";

	import Button from "./Button.svelte";

	type Props = {
		children: Snippet;
		trigger: Snippet;
		label?: string;
		alignment?: "left" | "right";
		className?: string;
	};

	let { alignment = "right", children, className, label, trigger }: Props = $props();

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
		class="dropdown-trigger cursor-pointer p-2 tracking-wide text-[#8c8c8c] uppercase group-has-[.dropdown-menu:popover-open]:bg-dropdown group-has-[.dropdown-menu:popover-open]:text-white hover:bg-dropdown hover:text-white"
		variant="ghost"
		aria-label={label}
	>
		{@render trigger()}
	</Button>

	<div
		{...popover.content}
		class={cn(
			"dropdown-menu inset-auto z-10 m-0 w-56 flex-col gap-1 overflow-hidden bg-dropdown text-[0.875rem] shadow-lg *:px-5 *:py-3 *:text-[#8c8c8c] open:flex [&_:is(a,button):focus]:outline-none [&>button]:w-full [&>button]:cursor-pointer [&>button]:justify-start [&>button:focus]:bg-dropdown-hover",
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
		onclick={(event) => {
			if ((event.target as HTMLElement).closest("a, button")) {
				popover.open = false;
			}
		}}
	>
		{@render children()}
	</div>
</div>
