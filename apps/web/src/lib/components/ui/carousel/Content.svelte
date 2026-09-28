<script lang="ts">
	import { cn } from "$lib/utils";
	import useEmblaCarousel from "embla-carousel-svelte";
	import type { Snippet } from "svelte";

	import { getCarousel } from "./context.svelte";

	let {
		children,
		class: className,
	}: {
		children: Snippet;
		class?: string;
	} = $props();

	const carousel = getCarousel();
</script>

<div
	class="col-start-1 row-start-1 h-full min-w-0 overflow-hidden"
	onemblaInit={(event) => carousel.attach(event.detail)}
	use:useEmblaCarousel={{
		options: carousel.options(),
		plugins: carousel.plugins(),
	}}
>
	<div class={cn("flex h-full", className)}>
		{@render children()}
	</div>
</div>
