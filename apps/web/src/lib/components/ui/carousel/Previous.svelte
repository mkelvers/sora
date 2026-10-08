<script lang="ts">
	import Button from "$lib/components/ui/Button.svelte";
	import { cn } from "$lib/utils";
	import { CaretLeftIcon } from "phosphor-svelte";

	import { getCarousel } from "./context.svelte";

	let {
		class: className,
	}: {
		class?: string;
	} = $props();

	const carousel = getCarousel();
</script>

{#if carousel.canPrevious}
	<Button
		variant="icon"
		class={cn(
			"pointer-events-auto z-40 col-start-1 row-start-1 h-20 w-auto self-center justify-self-start px-6 text-foreground drop-shadow-lg hover:text-muted",
			className,
		)}
		aria-label="Previous slides"
		onclick={() => carousel.api?.scrollPrev()}
	>
		<CaretLeftIcon size="1.9rem" weight="bold" />
	</Button>
{/if}
