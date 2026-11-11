<script lang="ts">
	import { page } from "$app/state";
	import EmptyState from "$lib/components/empty-state.svelte";
	import Skeleton from "$lib/components/snippets/skeleton.svelte";
	import Button from "$lib/components/ui/button.svelte";
	import { mascots } from "$lib/mascots";
	import { browseHref } from "$routes/(app)/(catalog)/browse/browse.svelte";
	import type { BrowseFilters } from "$routes/(app)/(catalog)/browse/browse.svelte";
	import { getGenres, getStudios, getTags } from "$routes/(app)/(catalog)/catalog.remote";

	import Results from "./components/results.svelte";

	const q = $derived(page.url.searchParams.get("q")?.trim() ?? "");
	let count = $derived(q ? 1 : 0);

	const same = (name: string) => name.toLowerCase() === q.toLowerCase();

	const genres = getGenres();
	const tags = getTags();
	const studios = $derived(getStudios(q.slice(0, 100)));

	const category = $derived.by(
		(): { name: string; filters: Partial<BrowseFilters> } | undefined => {
			const genre = genres.current?.find(same);
			if (genre) {
				return {
					filters: {
						genres: [genre],
					},
					name: genre,
				};
			}
			const tag = tags.current?.find((entry) => same(entry.name));
			if (tag) {
				return {
					filters: {
						tags: [tag.name],
					},
					name: tag.name,
				};
			}
			const studio = studios.current?.find(same);
			return studio
				? {
						filters: {
							studios: [studio],
						},
						name: studio,
					}
				: undefined;
		},
	);
</script>

<svelte:head>
	<title>{q ? `Search Results for ${q}` : "Search Anime"} - Sora</title>
</svelte:head>

<div class="page overflow-x-clip">
	{#if q}
		<section class="mx-auto w-full max-w-264" aria-labelledby="search-title">
			<div class="mb-8 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
				<h1 id="search-title" class="text-2xl font-bold">Search Results for “{q}”</h1>
				{#if category}
					<Button variant="link" href={browseHref(category.filters)}>
						Browse all {category.name} anime
					</Button>
				{/if}
			</div>

			<ul
				class="grid grid-cols-2 items-start gap-x-3 gap-y-8 sm:grid-cols-3 sm:gap-x-4 md:grid-cols-4 lg:grid-cols-5 lg:gap-x-7.5 lg:gap-y-12 xl:grid-cols-6"
			>
				{#each { length: count }, index (index)}
					<svelte:boundary>
						<Results {q} page={index + 1} last={index + 1 === count} onmore={() => (count += 1)} />

						{#snippet pending()}
							{#each { length: 12 }, index (index)}
								<li>
									<Skeleton class="aspect-2/3" />
									<Skeleton class="mt-3 h-4 w-4/5" />
								</li>
							{/each}
						{/snippet}

						{#snippet failed(_, reset)}
							<li class="col-span-full flex items-center gap-4 text-muted">
								<p>These results couldn’t be loaded.</p>
								<Button variant="ghost" onclick={reset}>Try Again</Button>
							</li>
						{/snippet}
					</svelte:boundary>
				{/each}
			</ul>
		</section>
	{:else}
		<h1 class="sr-only">Search</h1>
		<div class="grid min-h-full flex-1 place-items-center">
			<EmptyState
				class="w-full max-w-7xl py-16 sm:px-12 sm:py-22"
				mascot={mascots.search}
				title="Find something to watch."
				hint="Search for any anime by its title, your results will show up right here."
			/>
		</div>
	{/if}
</div>
