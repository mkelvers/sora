<script lang="ts">
	import { filterLabels, filters, resetFilters } from "$routes/(app)/(catalog)/catalog.svelte";
	import CatalogControls from "$routes/(app)/(catalog)/components/catalog-controls.svelte";
	import CatalogReset from "$routes/(app)/(catalog)/components/catalog-reset.svelte";
	import Catalog from "$routes/(app)/(catalog)/components/catalog.svelte";
</script>

<svelte:head>
	<title>Most Popular Anime Shows and Movies - Sora</title>
</svelte:head>

{#key `${filters.audio}:${filters.format}`}
	<Catalog
		title="Most Popular Anime"
		empty={{
			title: "The spotlight's empty right now.",
			hint: "Loosen a filter and see who steps up.",
		}}
		request={{
			kind: "popular",
			...filters,
		}}
	>
		{#snippet summary()}
			<CatalogReset labels={filterLabels(filters)} onreset={resetFilters} />
		{/snippet}

		{#snippet controls()}
			<CatalogControls kind="popular" />
		{/snippet}
	</Catalog>
{/key}
