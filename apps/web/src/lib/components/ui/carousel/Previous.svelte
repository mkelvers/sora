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
			"pointer-events-auto z-30 col-start-1 row-start-1 grid size-12 place-items-center self-center justify-self-start text-white drop-shadow-lg transition-transform hover:scale-110 active:scale-90",
			className,
		)}
		aria-label="Previous"
		onclick={() => carousel.api?.scrollPrev()}
	>
		<CaretLeftIcon size="1.65rem" weight="bold" />
	</Button>
{/if}
