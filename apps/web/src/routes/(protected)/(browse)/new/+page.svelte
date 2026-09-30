<script lang="ts">
	import Catalog from "$lib/components/Catalog.svelte";
	import CatalogControls, { catalogFilters } from "$lib/components/CatalogControls.svelte";
	import CatalogReset from "$lib/components/CatalogReset.svelte";
</script>

<svelte:head>
	<title>Newly Added · Sora</title>
</svelte:head>

{#key `${catalogFilters.audio}:${catalogFilters.format}`}
	<Catalog
		title="Newly Added Anime"
		empty={{
			title: "Nothing fresh in the last 30 days.",
			hint: "New arrivals land here the moment they're added.",
		}}
		request={{
			kind: "new",
			...catalogFilters,
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
