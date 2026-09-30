<script lang="ts" module>
	import { cva, type VariantProps } from "class-variance-authority";

	const button = cva(
		"inline-flex shrink-0 cursor-pointer items-center gap-2 whitespace-nowrap transition-[color,background-color,border-color,filter,transform] duration-150 outline-none select-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0",
		{
			variants: {
				variant: {
					primary:
						"h-11 justify-center bg-accent px-5 text-xs font-bold tracking-wide text-on-accent uppercase hover:brightness-110 active:scale-[0.97] sm:text-sm",
					outline:
						"h-11 justify-center border-2 border-accent px-5 text-xs font-bold tracking-wide text-accent uppercase hover:brightness-110 active:scale-[0.97] sm:text-sm",
					light:
						"justify-center bg-white/90 px-4.5 py-2.5 font-medium text-[#101010] hover:bg-white active:scale-[0.97]",
					ghost:
						"min-h-9 justify-center px-2 text-xs font-bold tracking-wide text-muted uppercase hover:bg-white/8 hover:text-foreground aria-pressed:bg-white/8 aria-pressed:text-foreground",
					icon: "size-9 justify-center text-muted hover:text-foreground active:scale-90",
					text: "min-h-9 justify-start text-xs font-medium tracking-wide text-accent uppercase hover:text-foreground",
					link: "text-accent underline-offset-4 hover:underline",
					item: "min-h-11 w-full justify-start px-5 py-3 text-left text-sm text-muted hover:bg-white/8 hover:text-foreground focus:bg-white/8 focus:text-foreground aria-checked:text-foreground aria-pressed:bg-white/8 aria-pressed:text-foreground aria-[current=page]:font-semibold aria-[current=page]:text-foreground",
				},
				tone: {
					accent: "text-accent hover:text-accent hover:brightness-125",
					danger: "hover:text-status-error",
				},
				size: {
					lg: "size-10",
					square: "w-11 px-0",
				},
				loading: {
					true: "before:size-3.5 before:animate-spin before:border-2 before:border-current before:border-t-transparent before:content-[''] disabled:opacity-100",
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
		Omit<Variants, "variant" | "loading"> & {
			variant: NonNullable<Variants["variant"]>;
			loading?: boolean;
			children?: Snippet;
		};

	let {
		class: className,
		variant,
		tone,
		size,
		loading = false,
		children,
		...props
	}: Props = $props();

	const classes = $derived(
		cn(
			button({
				variant,
				tone,
				size,
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
