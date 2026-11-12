<script lang="ts">
	import Skeleton from "$lib/components/snippets/skeleton.svelte";
	import { cn } from "$lib/utils";
	import type { CatalogRequest } from "$routes/(app)/(catalog)/catalog.remote";
	import type { Snippet } from "svelte";

	import CatalogResults from "./catalog-results.svelte";

	let {
		request,
		title,
		empty,
		controls,
		summary,
		aside,
	}: {
		request: CatalogRequest;
		title: string;
		empty: {
			title: string;
			hint: string;
		};
		controls: Snippet;
		summary?: Snippet;
		aside?: Snippet;
	} = $props();
</script>

<div class="page overflow-x-clip">
	<section
		class={cn("mx-auto w-full", aside ? "max-w-7xl" : "max-w-264")}
		aria-labelledby="catalog-title"
	>
		<div class="mb-8 flex flex-wrap items-center justify-between gap-2 sm:gap-4">
			<div class="flex flex-col items-start">
				<h1 id="catalog-title" class="text-2xl font-bold">{title}</h1>
				{@render summary?.()}
			</div>
			{@render controls()}
		</div>

		<div class={cn(aside && "lg:grid lg:grid-cols-[14rem_minmax(0,1fr)] lg:gap-12")}>
			{#if aside}
				<aside
					aria-label="Filters"
					class="-mx-2 grid content-start gap-6 max-lg:hidden lg:sticky lg:top-22 lg:max-h-[calc(100dvh-7rem)] lg:scrollbar-thin lg:self-start lg:overflow-y-auto"
				>
					{@render aside()}
				</aside>
			{/if}

			<div class="@container min-w-0">
				<svelte:boundary>
					{#key JSON.stringify(request)}
						<CatalogResults {request} {title} {empty} />
					{/key}

					{#snippet pending()}
						<ul
							class="grid grid-cols-2 items-start gap-x-3 gap-y-8 sm:gap-x-4 lg:gap-x-7.5 lg:gap-y-12 @min-[34rem]:grid-cols-3 @min-[42rem]:grid-cols-4 @min-[56rem]:grid-cols-5 @min-[64rem]:grid-cols-6"
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
			</div>
		</div>
	</section>
</div>
