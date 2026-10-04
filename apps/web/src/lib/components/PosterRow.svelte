<script lang="ts" module>
	import { cva, type VariantProps } from "class-variance-authority";

	const heading = cva("px-5 sm:px-10", {
		variants: {
			gutter: {
				wide: "lg:px-20",
				page: "lg:px-16",
			},
		},
	});

	const track = cva("gap-3 pt-2 pb-4 pl-5 sm:gap-4 sm:pl-10 lg:gap-7.5 hero:gap-6", {
		variants: {
			gutter: {
				wide: "lg:pl-20",
				page: "lg:pl-16",
			},
		},
	});

	const item = cva(
		"basis-[calc((100vw-3.25rem)/2)] last:mr-5 min-[30em]:basis-[calc((100vw-4.5rem)/3)] min-[35.5em]:basis-[calc((100vw-5.25rem)/4)] sm:basis-[calc((100vw-7.75rem)/4)] sm:last:mr-10 md:basis-[calc((100vw-9.75rem)/5)]",
		{
			variants: {
				gutter: {
					wide: "lg:basis-[calc((100vw-19.375rem)/5)] lg:last:mr-20 2xl:basis-[calc((100vw-21.25rem)/6)] hero:basis-[calc((100vw-18.875rem)/7)]",
					page: "lg:basis-[calc((100vw-17.375rem)/5)] lg:last:mr-16 2xl:basis-[calc((100vw-19.25rem)/6)] hero:basis-[calc((100vw-16.875rem)/7)]",
				},
			},
		},
	);
</script>

<script lang="ts">
	import Poster from "$lib/components/Poster.svelte";
	import Carousel from "$lib/components/ui/carousel/Carousel.svelte";
	import Content from "$lib/components/ui/carousel/Content.svelte";
	import Item from "$lib/components/ui/carousel/Item.svelte";
	import Next from "$lib/components/ui/carousel/Next.svelte";
	import Previous from "$lib/components/ui/carousel/Previous.svelte";
	import { cn } from "$lib/utils";
	import type { SeriesCard } from "@sora/sdk";

	let {
		id,
		title,
		hint,
		cards,
		gutter = "wide",
	}: {
		id: string;
		title: string;
		hint?: string;
		cards: SeriesCard[];
		gutter?: NonNullable<VariantProps<typeof heading>["gutter"]>;
	} = $props();
</script>

{#if cards.length}
	<div class="relative z-20 pb-10 sm:pb-12 lg:pb-16">
		<h2
			{id}
			class={cn(
				heading({
					gutter,
				}),
				"text-xl font-bold sm:text-2xl",
			)}
		>
			{title}
		</h2>
		{#if hint}
			<p
				class={cn(
					heading({
						gutter,
					}),
					"mt-1 text-sm text-[#8c8c8c] sm:text-base",
				)}
			>
				{hint}
			</p>
		{/if}

		<Carousel
			class="mt-5 min-w-0"
			aria-labelledby={id}
			options={{
				slidesToScroll: "auto",
				duration: 20,
			}}
		>
			{#snippet children()}
				<Content
					class={track({
						gutter,
					})}
				>
					{#each cards as card (card.id)}
						<Item
							class={item({
								gutter,
							})}
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
{/if}
