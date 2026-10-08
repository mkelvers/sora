<script lang="ts" module>
	import { cva, type VariantProps } from "class-variance-authority";

	const button = cva(
		"inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 whitespace-nowrap transition-[color,background-color,border-color,filter] duration-150 outline-none select-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0",
		{
			variants: {
				variant: {
					primary:
						"bg-accent font-bold tracking-wide text-on-accent uppercase hover:brightness-110",
					secondary:
						"border-2 border-accent font-bold tracking-wide text-accent uppercase hover:bg-accent/10",
					ghost:
						"font-bold tracking-wide text-muted uppercase hover:bg-hover hover:text-foreground aria-expanded:bg-hover aria-expanded:text-foreground aria-pressed:text-foreground",
					icon: "text-muted hover:bg-hover hover:text-foreground aria-expanded:bg-hover aria-expanded:text-foreground",
					item: "w-full justify-start px-5 text-left text-sm text-muted hover:bg-hover hover:text-foreground focus-visible:bg-hover focus-visible:text-foreground focus-visible:-outline-offset-2 aria-checked:text-foreground aria-expanded:text-foreground aria-pressed:bg-hover aria-pressed:text-foreground aria-[current]:text-foreground max-sm:text-base",
					nav: "h-full px-4 text-sm font-medium text-muted hover:bg-hover hover:text-foreground focus-visible:-outline-offset-2 aria-expanded:bg-hover aria-expanded:text-foreground",
				},
				size: {
					md: "",
					sm: "",
				},
				square: {
					true: "px-0",
				},
				tone: {
					danger: "hover:text-danger focus-visible:text-danger",
				},
				loading: {
					true: "before:size-3.5 before:animate-spin before:border-2 before:border-current before:border-t-transparent disabled:opacity-100",
				},
			},
			compoundVariants: [
				{
					variant: ["primary", "secondary"],
					size: "md",
					class: "h-11 px-5 text-sm",
				},
				{
					variant: ["primary", "secondary"],
					size: "sm",
					class: "h-9 px-3 text-xs",
				},
				{
					variant: "ghost",
					size: "md",
					class: "h-11 px-3 text-sm",
				},
				{
					variant: "ghost",
					size: "sm",
					class: "h-9 px-2 text-xs",
				},
				{
					variant: ["primary", "secondary", "ghost", "icon"],
					size: "md",
					square: true,
					class: "w-11",
				},
				{
					variant: ["primary", "secondary", "ghost", "icon"],
					size: "sm",
					square: true,
					class: "w-9",
				},
				{
					variant: "icon",
					size: "md",
					class: "size-11",
				},
				{
					variant: "icon",
					size: "sm",
					class: "size-9",
				},
				{
					variant: "item",
					size: "md",
					class: "min-h-11 py-3 max-sm:min-h-13",
				},
				{
					variant: "item",
					size: "sm",
					class: "min-h-9 px-2",
				},
				{
					variant: "nav",
					square: true,
					class: "w-14",
				},
				{
					variant: "item",
					tone: "danger",
					class: "text-danger",
				},
			],
			defaultVariants: {
				size: "md",
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
				variant,
				size,
				square,
				tone,
				loading,
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
