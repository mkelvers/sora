<script lang="ts">
	import {
		browse,
		browseTitle,
		catalogRequest,
	} from "$routes/(app)/(catalog)/browse/browse.svelte";
	import type { BrowseFilters as Filters } from "$routes/(app)/(catalog)/browse/browse.svelte";
	import Catalog from "$routes/(app)/(catalog)/components/catalog.svelte";

	import type { PageProps } from "./$types";
	import BrowseControls from "./components/browse-controls.svelte";
	import FilterList from "./components/filter-list.svelte";

	let { data }: PageProps = $props();

	const title = $derived(browseTitle(browse));

	const apply = (next: Filters) => {
		Object.assign(browse, next);
	};
</script>

<svelte:head>
	<title>{title} Shows and Movies - Sora</title>
</svelte:head>

<Catalog
	{title}
	empty={{
		title: "Nothing matches all of that.",
		hint: "Loosen a filter and see what turns up.",
	}}
	request={catalogRequest($state.snapshot(browse))}
>
	{#snippet aside()}
		<FilterList filters={browse} genres={data.genres} tags={data.tags} onchange={apply} />
	{/snippet}

	{#snippet controls()}
		<BrowseControls filters={browse} genres={data.genres} tags={data.tags} onchange={apply} />
	{/snippet}
</Catalog>
