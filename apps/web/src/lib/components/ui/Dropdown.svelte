<script lang="ts" module>
	import { cva, type VariantProps } from "class-variance-authority";

	const triggerVariants = cva(
		"dropdown-trigger group-has-[.dropdown-menu:popover-open]:bg-white/8 group-has-[.dropdown-menu:popover-open]:text-foreground",
		{
			variants: {
				variant: {
					menu: "",
					toolbar:
						"h-10 gap-2 px-3 text-sm font-medium tracking-normal group-has-[.dropdown-menu:popover-open]:bg-dropdown hover:bg-dropdown",
					bar: "h-full gap-1 px-3 group-has-[.dropdown-menu:popover-open]:bg-header-hover hover:bg-header-hover",
					link: "h-full px-4 text-sm font-medium tracking-normal normal-case group-has-[.dropdown-menu:popover-open]:bg-header-hover hover:bg-header-hover",
					icon: "h-full w-12 justify-center p-0 group-has-[.dropdown-menu:popover-open]:bg-header-hover group-has-[.dropdown-menu:popover-open]:text-foreground hover:bg-header-hover hover:text-foreground",
					outline:
						"size-11 border-2 border-accent px-0 text-accent group-has-[.dropdown-menu:popover-open]:bg-transparent group-has-[.dropdown-menu:popover-open]:text-accent hover:bg-transparent hover:text-accent hover:brightness-110 active:scale-97",
					overlay: "bg-transparent! hover:text-white",
				},
			},
		},
	);

	const root = cva("dropdown-root group relative", {
		variants: {
			variant: {
				menu: "",
				toolbar: "",
				bar: "h-full",
				link: "h-full",
				icon: "h-full",
				outline: "",
				overlay: "",
			},
		},
	});

	const menu = cva(
		"dropdown-menu inset-auto z-10 m-0 w-56 flex-col overflow-hidden bg-dropdown shadow-lg open:flex",
		{
			variants: {
				variant: {
					menu: "",
					toolbar:
						"[&_:is(a,button):focus:not(:hover)]:bg-transparent [&_:is(a,button):focus:not(:hover):not([aria-checked=true])]:text-muted",
					bar: "",
					link: "",
					icon: "",
					outline: "",
					overlay: "",
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
		variant?: NonNullable<VariantProps<typeof triggerVariants>["variant"]>;
		class?: string;
	};

	let {
		alignment = "right",
		variant = "menu",
		children,
		class: className,
		label,
		trigger,
	}: Props = $props();

	const popover = new Popover({
		focus: {
			onOpen: (): string => `#${popover.ids.popover} [aria-checked="true"]`,
			onClose: null,
		},
		floatingConfig: () => ({
			computePosition: {
				placement: alignment === "left" ? "bottom-start" : "bottom-end",
			},
			offset: 0,
		}),
	});
</script>

<div
	class={root({
		variant,
	})}
>
	<Button
		{...popover.trigger}
		variant="ghost"
		class={triggerVariants({
			variant,
		})}
		aria-label={label}
	>
		{@render trigger()}
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
