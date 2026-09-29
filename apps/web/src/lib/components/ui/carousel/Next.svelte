<script lang="ts">
	import Button from "$lib/components/ui/Button.svelte";
	import { cn } from "$lib/utils";
	import { CaretRightIcon } from "phosphor-svelte";

	import { getCarousel } from "./context.svelte";

	let {
		class: className,
	}: {
		class?: string;
	} = $props();

	const carousel = getCarousel();
</script>

{#if carousel.canNext}
	<Button
		variant="icon"
		class={cn(
			"pointer-events-auto z-40 col-start-1 row-start-1 h-20 w-auto self-center justify-self-end px-6 text-white drop-shadow-lg hover:text-white/70",
			className,
		)}
		aria-label="Next slides"
		onclick={() => carousel.api?.scrollNext()}
	>
		<CaretRightIcon size="1.9rem" weight="bold" />
	</Button>
{/if}
