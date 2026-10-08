<script lang="ts">
	import Carousel from "$lib/components/ui/carousel/Carousel.svelte";
	import Content from "$lib/components/ui/carousel/Content.svelte";
	import Item from "$lib/components/ui/carousel/Item.svelte";
	import Next from "$lib/components/ui/carousel/Next.svelte";
	import Previous from "$lib/components/ui/carousel/Previous.svelte";
	import Poster from "$routes/(app)/components/Poster.svelte";
	import type { Series } from "@sora/sdk";

	let { parts }: { parts: Series["franchise"] } = $props();
</script>

<div class="pb-10 sm:pb-12 lg:pb-16">
	<h2 id="related-titles" class="px-5 text-xl font-bold sm:px-10 sm:text-2xl lg:px-16">
		More from this series
	</h2>
	<Carousel
		class="mt-5 min-w-0"
		aria-labelledby="related-titles"
		options={{ slidesToScroll: "auto", duration: 20 }}
	>
		{#snippet children()}
			<Content class="gap-3 pt-2 pb-4 pl-5 sm:gap-4 sm:pl-10 lg:gap-7.5 lg:pl-16">
				{#each parts as part (part.series_id)}
					<Item
						class="basis-[calc((100vw-3.25rem)/2)] last:mr-5 xs:basis-[calc((100vw-4.5rem)/3)] sm:basis-[calc((100vw-7.75rem)/4)] sm:last:mr-10 md:basis-[calc((100vw-9.75rem)/5)] lg:basis-[calc((100vw-17.375rem)/5)] lg:last:mr-16 2xl:basis-[calc((100vw-19.25rem)/6)]"
					>
						<Poster card={part.card} />
					</Item>
				{/each}
			</Content>
			<Previous class="max-sm:hidden" />
			<Next class="max-sm:hidden" />
		{/snippet}
	</Carousel>
</div>
