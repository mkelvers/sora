<script lang="ts">
	import EmptyState from "$lib/components/empty-state.svelte";
	import Button from "$lib/components/ui/button.svelte";
	import Input from "$lib/components/ui/input.svelte";
	import { mascots } from "$lib/mascots";
	import { setBrowse } from "$routes/(app)/(catalog)/browse/browse.svelte";

	import type { PageProps } from "./$types";
	import { CategorySearch } from "./search";

	let { data }: PageProps = $props();
	let query = $state("");

	const sections = $derived([
		{
			id: "genres",
			label: "Genres",
			links: data.genres.map((genre) => ({
				label: genre,
				preset: {
					genres: [genre],
				},
			})),
		},
		{
			id: "tags",
			label: "Tags",
			links: data.tags
				.map((tag) => ({
					label: tag.name,
					preset: {
						tags: [tag.name],
					},
				}))
				.toSorted((left, right) => left.label.localeCompare(right.label)),
		},
		{
			id: "studios",
			label: "Studios",
			links: data.studios.map((studio) => ({
				label: studio,
				preset: {
					studios: [studio],
				},
			})),
		},
	]);
	const filtered = $derived.by(() => {
		const search = new CategorySearch(query);
		return sections
			.map((section) => ({
				...section,
				links: section.links.filter((link) => search.matches(`${section.label} ${link.label}`)),
			}))
			.filter((section) => section.links.length > 0);
	});
</script>

<svelte:head>
	<title>Anime Categories - Sora</title>
</svelte:head>

<div class="page overflow-x-clip">
	<div class="mx-auto w-full max-w-264">
		<div class="mb-8 flex flex-wrap items-center gap-x-8 gap-y-4">
			<h1 class="text-2xl font-bold">Categories</h1>
			<Input
				type="search"
				aria-label="Search categories"
				placeholder="Search categories"
				bind:value={query}
				class="h-9 w-72 max-w-full border-x-0 border-t-0 px-0 focus-visible:border-muted"
			/>
		</div>

		{#each filtered as section (section.id)}
			<section class="mb-12" aria-labelledby="categories-{section.id}">
				<h2 id="categories-{section.id}" class="mb-4 text-lg font-bold">{section.label}</h2>
				<ul class="-mx-2 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
					{#each section.links as link (link.label)}
						<li>
							<Button
								href="/browse"
								variant="item"
								size="sm"
								class="whitespace-normal"
								onclick={() => setBrowse(link.preset)}
							>
								{link.label}
							</Button>
						</li>
					{/each}
				</ul>
			</section>
		{/each}
		{#if filtered.length === 0}
			<EmptyState
				mascot={mascots.emptySearch}
				title="No matching categories"
				hint="Try a different genre, tag, or studio."
			/>
		{/if}
	</div>
</div>
