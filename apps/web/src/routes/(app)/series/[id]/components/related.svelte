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
	<h2 {id} class="px-5 text-xl font-bold sm:px-10 lg:px-16">
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
		{#snippet children()}
			<Content class="gap-3 pt-2 pb-4 pl-5 sm:gap-4 sm:pl-10 lg:gap-7.5 lg:pl-16">
				{#each cards as card (card.id)}
					<Item
						class="basis-[calc((100vw-4rem)/3)] last:mr-5 sm:basis-[calc((100vw-8rem)/4)] sm:last:mr-10 lg:basis-[calc((100vw-13.625rem)/4)] lg:last:mr-16 wide:basis-[calc((100vw-15.5rem)/5)] hero:basis-[calc((100vw-19.25rem)/7)]"
					>
						<Poster {card} />
					</Item>
				{/each}
			</Content>
			<Previous class="max-sm:hidden" />
			<Next class="max-sm:hidden" />
		{/snippet}
	</Carousel>
</div>
