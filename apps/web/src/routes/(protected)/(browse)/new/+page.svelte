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
		empty="No anime were added in the last 30 days."
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
