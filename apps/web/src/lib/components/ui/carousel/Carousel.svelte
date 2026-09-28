<script lang="ts">
	import { cn } from "$lib/utils";
	import type { EmblaOptionsType, EmblaPluginType } from "embla-carousel";
	import type { Snippet } from "svelte";

	import { CarouselState, setCarousel } from "./context.svelte";

	let {
		children,
		class: className,
		options = {},
		plugins = [],
	}: {
		children: Snippet<[CarouselState]>;
		class?: string;
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

<section class={cn("grid", className)} aria-roledescription="carousel">
	{@render children(carousel)}
</section>
