<script lang="ts">
	import Button from "$lib/components/ui/button.svelte";
	import { groupsOf, toggle } from "$routes/(app)/(catalog)/browse/browse.svelte";
	import type { BrowseFilters, Group } from "$routes/(app)/(catalog)/browse/browse.svelte";
	import type { Tag } from "@sora/sdk";

	let {
		filters,
		genres,
		tags,
		onchange,
	}: {
		filters: BrowseFilters;
		genres: string[];
		tags: Tag[];
		onchange: (next: BrowseFilters) => void;
	} = $props();

	const popularTags = 30;

	let allTags = $state(false);

	const groups = $derived(
		groupsOf({
			filters,
			genres,
			tags,
		}),
	);

	const popular = $derived(
		new Set(
			tags
				.filter((tag) => tag.group === "demographic" || tag.group === "theme")
				.toSorted((left, right) => right.titles - left.titles)
				.slice(0, popularTags)
				.map((tag) => tag.name),
		),
	);

	const sections = $derived<Group[]>([
		groups.genres,
		...groups.options,
		groups.country,
		groups.source,
		{
			choices: [
				{
					all: false,
					checked: filters.hideMature,
					label: "Hide mature",
					next: {
						hideMature: !filters.hideMature,
					},
				},
			],
			id: "content",
			label: "Content",
			multiple: true,
		},
		{
			...groups.tags,
			choices: allTags
				? groups.tags.choices
				: groups.tags.choices.filter((choice) => popular.has(choice.label) || choice.checked),
		},
	]);
</script>

{#snippet row(label: string, pressed: boolean, onclick: () => void)}
	<Button aria-pressed={pressed} variant="item" size="sm" {onclick}>
		<span class="min-w-0 truncate">{label}</span>
	</Button>
{/snippet}

{#if filters.studios.length}
	<section>
		<h2 class="mb-1 px-2 text-sm text-subtle">Studios</h2>
		<div class="grid" role="group" aria-label="Studios">
			{#each filters.studios as studio (studio)}
				{@render row(studio, true, () =>
					onchange({
						...filters,
						studios: toggle(filters.studios, studio),
					}),
				)}
			{/each}
		</div>
	</section>
{/if}

{#each sections as section (section.id)}
	<section>
		<h2 class="mb-1 px-2 text-sm text-subtle">{section.label}</h2>
		<div class="grid" role="group" aria-label={section.label}>
			{#if section.id === "genres" || section.id === "sources"}
				{@render row("All", !section.choices.some((choice) => choice.checked), () =>
					onchange({
						...filters,
						[section.id]: [],
					}),
				)}
			{/if}
			{#each section.choices as choice (choice.label)}
				{@render row(choice.label, choice.checked, () =>
					onchange({
						...filters,
						...choice.next,
					}),
				)}
			{/each}
			{#if section.id === "tags"}
				<Button
					variant="item"
					size="sm"
					class="text-subtle"
					aria-expanded={allTags}
					onclick={() => (allTags = !allTags)}
				>
					{allTags ? "Fewer tags" : `All ${tags.length} tags`}
				</Button>
			{/if}
		</div>
	</section>
{/each}
