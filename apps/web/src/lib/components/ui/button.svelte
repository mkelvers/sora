<script lang="ts" module>
	import { cva } from "class-variance-authority";
	import type { VariantProps } from "class-variance-authority";

	const button = cva(
		"inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 whitespace-nowrap transition-[color,background-color,border-color,filter] duration-150 outline-none select-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0",
		{
			compoundVariants: [
				{
					class: "h-11 px-5 text-sm",
					size: "md",
					variant: ["primary", "secondary"],
				},
				{
					class: "h-9 px-3 text-xs",
					size: "sm",
					variant: ["primary", "secondary"],
				},
				{
					class: "h-9 px-0 text-sm",
					size: "sm",
					variant: "plain",
				},
				{
					class: "h-11 px-3 text-sm",
					size: "md",
					variant: "ghost",
				},
				{
					class: "h-9 px-2 text-xs",
					size: "sm",
					variant: "ghost",
				},
				{
					class: "w-11",
					size: "md",
					square: true,
					variant: ["primary", "secondary", "ghost", "icon"],
				},
				{
					class: "w-9",
					size: "sm",
					square: true,
					variant: ["primary", "secondary", "ghost", "icon"],
				},
				{
					class: "size-11",
					size: "md",
					variant: "icon",
				},
				{
					class: "size-9",
					size: "sm",
					variant: "icon",
				},
				{
					class: "min-h-11 py-3 max-sm:min-h-13",
					size: "md",
					variant: "item",
				},
				{
					class: "min-h-9 px-2",
					size: "sm",
					variant: "item",
				},
				{
					class: "w-14",
					square: true,
					variant: "nav",
				},
				{
					class: "text-danger",
					tone: "danger",
					variant: "item",
				},
				{
					class: "text-accent hover:text-accent",
					tone: "accent",
				},
			],
			defaultVariants: {
				size: "md",
			},
			variants: {
				loading: {
					true: "before:size-3.5 before:animate-spin before:border-2 before:border-current before:border-t-transparent disabled:opacity-100",
				},
				size: {
					md: "",
					sm: "",
				},
				square: {
					true: "px-0",
				},
				tone: {
					accent: "hover:brightness-125",
					danger: "hover:text-danger focus-visible:text-danger",
				},
				variant: {
					ghost:
						"font-bold tracking-wide text-muted uppercase hover:bg-hover hover:text-foreground aria-expanded:bg-hover aria-expanded:text-foreground aria-pressed:text-foreground",
					icon: "text-muted hover:text-foreground aria-expanded:text-foreground",
					item: "w-full justify-start px-5 text-left text-sm text-muted hover:bg-hover hover:text-foreground focus-visible:bg-hover focus-visible:text-foreground focus-visible:-outline-offset-2 aria-checked:text-foreground aria-expanded:text-foreground aria-pressed:bg-hover aria-pressed:text-foreground aria-[current]:text-foreground max-sm:text-base",
					nav: "h-full px-4 text-sm font-medium text-muted hover:bg-hover hover:text-foreground focus-visible:-outline-offset-2 aria-expanded:bg-hover aria-expanded:text-foreground",
					plain:
						"font-medium text-foreground hover:text-accent-secondary aria-expanded:text-accent-secondary",
					primary:
						"bg-accent font-bold tracking-wide text-on-accent uppercase hover:brightness-110",
					secondary:
						"border-2 border-accent font-bold tracking-wide text-accent uppercase hover:bg-accent/10",
					text: "h-11 gap-2 font-bold text-foreground hover:text-accent-secondary aria-expanded:text-accent-secondary",
					toolbar:
						"h-10 gap-2 px-3 text-sm font-medium text-muted uppercase hover:bg-hover hover:text-foreground aria-expanded:bg-hover aria-expanded:text-foreground",
				},
			},
		},
	);
</script>

<script lang="ts">
	import { cn } from "$lib/utils";
	import type { Snippet } from "svelte";
	import type { HTMLAnchorAttributes, HTMLButtonAttributes } from "svelte/elements";

	type Variants = VariantProps<typeof button>;

	type Props = (HTMLButtonAttributes | HTMLAnchorAttributes) &
		Omit<Variants, "variant" | "loading" | "square"> & {
			variant: NonNullable<Variants["variant"]>;
			square?: boolean;
			loading?: boolean;
			children?: Snippet;
		};

	let {
		class: className,
		variant,
		size,
		square = false,
		tone,
		loading = false,
		children,
		...props
	}: Props = $props();

	const classes = $derived(
		cn(
			button({
				loading,
				size,
				square,
				tone,
				variant,
			}),
			className,
		),
	);
</script>

{#if "href" in props && props.href !== undefined}
	<a class={classes} {...props as HTMLAnchorAttributes}>
		{@render children?.()}
	</a>
{:else}
	{@const attributes = props as HTMLButtonAttributes}
	<button
		type="button"
		{...attributes}
		class={classes}
		disabled={loading || attributes.disabled}
		aria-busy={loading || undefined}
	>
		{@render children?.()}
	</button>
{/if}
