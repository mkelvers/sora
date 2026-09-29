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
		class={cn(
			"pointer-events-auto z-40 col-start-1 row-start-1 grid h-20 place-items-center self-center justify-self-end px-6 text-white drop-shadow-lg transition-colors duration-150 hover:text-[#8c8c8c]",
			className,
		)}
		aria-label="Next"
		onclick={() => carousel.api?.scrollNext()}
	>
		<CaretRightIcon size="1.9rem" weight="bold" />
	</Button>
{/if}
