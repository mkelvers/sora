<script lang="ts">
	import { cn } from "$lib/utils";
	import type { EmblaOptionsType, EmblaPluginType } from "embla-carousel";
	import type { Snippet } from "svelte";
	import type { HTMLAttributes } from "svelte/elements";

	import { CarouselState, setCarousel } from "./context.svelte";

	let {
		children,
		class: className,
		options = {},
		plugins = [],
		...rest
	}: Omit<HTMLAttributes<HTMLElement>, "children"> & {
		children: Snippet<[CarouselState]>;
		options?: EmblaOptionsType;
		plugins?: EmblaPluginType[];
	} = $props();

	const carousel = setCarousel(
		new CarouselState(
			() => options,
			() => plugins,
		),
	);
</script>

<section {...rest} class={cn("grid", className)} aria-roledescription="carousel">
	{@render children(carousel)}
</section>
