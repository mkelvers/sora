<script lang="ts">
	import { filters } from "$routes/(app)/(catalog)/catalog.svelte";
	import Catalog from "$routes/(app)/(catalog)/components/Catalog.svelte";
	import CatalogControls from "$routes/(app)/(catalog)/components/CatalogControls.svelte";
	import CatalogReset from "$routes/(app)/(catalog)/components/CatalogReset.svelte";
</script>

<svelte:head>
	<title>Newly added · Sora</title>
</svelte:head>

{#key `${filters.audio}:${filters.format}`}
	<Catalog
		title="Newly added anime"
		empty={{
			title: "Nothing fresh in the last 30 days.",
			hint: "New arrivals land here the moment they're added.",
		}}
		request={{
			kind: "new",
			...filters,
		}}
	>
		{#snippet summary()}
			<CatalogReset />
		{/snippet}

		{#snippet controls()}
			<CatalogControls kind="new" />
		{/snippet}
	</Catalog>
{/key}
