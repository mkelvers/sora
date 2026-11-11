<script lang="ts">
	import { goto } from "$app/navigation";
	import { page } from "$app/state";
	import {
		browseHref,
		browseLabels,
		browseTitle,
		catalogRequest,
		noFilters,
		parseFilters,
	} from "$routes/(app)/(catalog)/browse/browse.svelte";
	import type { BrowseFilters } from "$routes/(app)/(catalog)/browse/browse.svelte";
	import CatalogReset from "$routes/(app)/(catalog)/components/catalog-reset.svelte";
	import Catalog from "$routes/(app)/(catalog)/components/catalog.svelte";

	import type { PageProps } from "./$types";
	import BrowseControls from "./components/browse-controls.svelte";

	let { data }: PageProps = $props();

	const filters = $derived(parseFilters(page.url.searchParams, data.genres, data.tags));
	const title = $derived(browseTitle(filters));

	const apply = (next: BrowseFilters) =>
		goto(browseHref(next), {
			reset: false,
		});
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
	request={catalogRequest(filters)}
>
	{#snippet summary()}
		<CatalogReset
			labels={browseLabels(filters)}
			onreset={() =>
				apply({
					...noFilters,
					sort: filters.sort,
				})}
		/>
	{/snippet}

	{#snippet controls()}
		<BrowseControls {filters} onchange={apply} />
	{/snippet}
</Catalog>
