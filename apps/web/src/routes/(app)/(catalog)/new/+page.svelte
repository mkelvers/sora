<script lang="ts">
	import Catalog from "$routes/(app)/(catalog)/components/Catalog.svelte";
	import CatalogControls, {
		catalogFilters,
	} from "$routes/(app)/(catalog)/components/CatalogControls.svelte";
	import CatalogReset from "$routes/(app)/(catalog)/components/CatalogReset.svelte";
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
