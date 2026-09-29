<script lang="ts" module>
	import { cva, type VariantProps } from "class-variance-authority";

	const trigger = cva(
		"dropdown-trigger group-has-[.dropdown-menu:popover-open]:bg-white/8 group-has-[.dropdown-menu:popover-open]:text-foreground",
		{
			variants: {
				variant: {
					menu: "",
					toolbar:
						"h-10 gap-2 px-3 text-sm font-medium tracking-normal group-has-[.dropdown-menu:popover-open]:bg-dropdown hover:bg-dropdown",
				},
			},
		},
	);

	const menu = cva(
		"dropdown-menu inset-auto z-10 m-0 w-56 flex-col overflow-hidden bg-dropdown shadow-lg open:flex",
		{
			variants: {
				variant: {
					menu: "",
					toolbar:
						"[&_:is(a,button):focus:not(:hover)]:bg-transparent [&_:is(a,button):focus:not(:hover):not([aria-checked=true])]:text-muted",
				},
			},
		},
	);
</script>

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
		variant?: NonNullable<VariantProps<typeof trigger>["variant"]>;
		class?: string;
	};

	let {
		alignment = "right",
		variant = "menu",
		children,
		class: className,
		label,
		trigger: triggerContent,
	}: Props = $props();

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
		class={trigger({
			variant,
		})}
		aria-label={label}
	>
		{@render triggerContent()}
	</Button>

	<div
		{...popover.content}
		class={cn(
			menu({
				variant,
			}),
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
