<script lang="ts">
	import { filters } from "$routes/(app)/(catalog)/catalog.svelte";
	import Catalog from "$routes/(app)/(catalog)/components/Catalog.svelte";
	import CatalogControls from "$routes/(app)/(catalog)/components/CatalogControls.svelte";
	import CatalogReset from "$routes/(app)/(catalog)/components/CatalogReset.svelte";
</script>

<svelte:head>
	<title>Most popular · Sora</title>
</svelte:head>

{#key `${filters.audio}:${filters.format}`}
	<Catalog
		title="Most popular anime"
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
			<CatalogReset />
		{/snippet}

		{#snippet controls()}
			<CatalogControls kind="popular" />
		{/snippet}
	</Catalog>
{/key}
