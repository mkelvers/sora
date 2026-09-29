<script lang="ts">
	import Button from "$lib/components/ui/Button.svelte";
	import { cn } from "$lib/utils";
	import { CaretLeftIcon } from "phosphor-svelte";

	import { getCarousel } from "./context.svelte";

	let { class: className }: { class?: string } = $props();

	const carousel = getCarousel();
</script>

{#if carousel.canPrevious}
	<Button
		class={cn(
			"pointer-events-auto z-40 col-start-1 row-start-1 grid h-20 place-items-center self-center justify-self-start px-6 text-white drop-shadow-lg transition-colors duration-150 hover:text-[#8c8c8c]",
			className,
		)}
		aria-label="Previous"
		onclick={() => carousel.api?.scrollPrev()}
	>
		<CaretLeftIcon size="1.9rem" weight="bold" />
	</Button>
{/if}
