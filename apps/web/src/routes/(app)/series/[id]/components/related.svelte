<script lang="ts">
	import Carousel from "$lib/components/ui/carousel/carousel.svelte";
	import Content from "$lib/components/ui/carousel/content.svelte";
	import Item from "$lib/components/ui/carousel/item.svelte";
	import Next from "$lib/components/ui/carousel/next.svelte";
	import Previous from "$lib/components/ui/carousel/previous.svelte";
	import Poster from "$routes/(app)/components/poster.svelte";
	import type { SeriesCard } from "@sora/sdk";

	let {
		id,
		heading,
		cards,
	}: {
		id: string;
		heading: string;
		cards: SeriesCard[];
	} = $props();
</script>

<div class="pb-8 sm:pb-10">
	<h2 {id} class="px-5 text-xl font-bold sm:px-10 lg:px-16 hero:px-20">
		{heading}
	</h2>
	<Carousel
		class="mt-3 min-w-0"
		aria-labelledby={id}
		options={{
			slidesToScroll: "auto",
			duration: 20,
		}}
	>
		{#snippet children(carousel)}
			<Content class="gap-3 pt-2 pb-4 pl-5 sm:gap-4 sm:pl-10 lg:gap-7.5 lg:pl-16 hero:pl-20">
				{#each cards as card (card.id)}
					<Item
						class="basis-[calc((100vw-3.25rem)/2)] last:mr-5 sm:basis-[calc((100vw-8rem)/4)] sm:last:mr-10 lg:basis-[calc((100vw-13.625rem)/4)] lg:last:mr-16 wide:basis-[calc((100vw-15.5rem)/5)] hero:basis-[calc((100vw-21.25rem)/7)] hero:last:mr-20"
					>
						<Poster {card} />
					</Item>
				{/each}
			</Content>
			<Previous class="max-sm:hidden" />
			<Next class="max-sm:hidden" />
			{#if carousel.pages > 1}
				<div class="mt-2 flex justify-center gap-2 max-sm:hidden">
					{#each { length: carousel.pages }, index (index)}
						<button
							type="button"
							class={[
								"grid h-6 w-12 cursor-pointer place-items-center outline-none after:h-0.75 after:w-full after:transition-colors after:duration-150 focus-visible:outline-2 focus-visible:outline-accent",
								index === carousel.active
									? "after:bg-accent"
									: "after:bg-border-strong hover:after:bg-foreground",
							]}
							aria-label="Page {index + 1}"
							aria-current={index === carousel.active}
							onclick={() => carousel.select(index)}
						></button>
					{/each}
				</div>
			{/if}
		{/snippet}
	</Carousel>
</div>
