<script lang="ts">
	import Skeleton from "$lib/components/snippets/skeleton.svelte";
	import type { CatalogRequest } from "$routes/(app)/(catalog)/catalog.remote";
	import type { Snippet } from "svelte";

	import CatalogResults from "./catalog-results.svelte";

	let {
		request,
		title,
		empty,
		controls,
		summary,
	}: {
		request: CatalogRequest;
		title: string;
		empty: {
			title: string;
			hint: string;
		};
		controls: Snippet;
		summary?: Snippet;
	} = $props();
</script>

<div class="page overflow-x-clip">
	<section class="mx-auto w-full max-w-264" aria-labelledby="catalog-title">
		<div class="mb-8 flex items-center justify-between gap-2 sm:gap-4">
			<div class="flex flex-col items-start">
				<h1 id="catalog-title" class="text-2xl font-bold">{title}</h1>
				{@render summary?.()}
			</div>
			{@render controls()}
		</div>

		<svelte:boundary>
			<CatalogResults {request} {title} {empty} />

			{#snippet pending()}
				<ul
					class="grid grid-cols-2 items-start gap-x-3 gap-y-8 sm:grid-cols-3 sm:gap-x-4 md:grid-cols-4 lg:grid-cols-5 lg:gap-x-7.5 lg:gap-y-12 xl:grid-cols-6"
				>
					{#each { length: 12 }, index (index)}
						<li>
							<Skeleton class="aspect-2/3" />
							<Skeleton class="mt-3 h-4 w-4/5" />
						</li>
					{/each}
				</ul>
			{/snippet}
		</svelte:boundary>
	</section>
</div>
