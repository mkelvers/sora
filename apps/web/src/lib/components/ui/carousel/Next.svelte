<script lang="ts">
	import Button from "$lib/components/ui/Button.svelte";
	import { cn } from "$lib/utils";
	import { CaretRightIcon } from "phosphor-svelte";

	import { getCarousel } from "./context.svelte";

	let { class: className }: { class?: string } = $props();

	const carousel = getCarousel();
</script>

{#if carousel.canNext}
	<Button
		class={cn(
			"pointer-events-auto z-30 col-start-1 row-start-1 grid size-12 place-items-center self-center justify-self-end text-white drop-shadow-lg transition-transform hover:scale-110 active:scale-90",
			className,
		)}
		aria-label="Next"
		onclick={() => carousel.api?.scrollNext()}
	>
		<CaretRightIcon size="1.65rem" weight="bold" />
	</Button>
{/if}
