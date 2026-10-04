<script lang="ts">
	import Catalog from "$routes/(app)/(catalog)/components/Catalog.svelte";
	import CatalogControls, {
		catalogFilters,
	} from "$routes/(app)/(catalog)/components/CatalogControls.svelte";
	import CatalogReset from "$routes/(app)/(catalog)/components/CatalogReset.svelte";
</script>

<svelte:head>
	<title>Most Popular · Sora</title>
</svelte:head>

{#key `${catalogFilters.audio}:${catalogFilters.format}`}
	<Catalog
		title="Most Popular Anime"
		empty={{
			title: "The spotlight's empty right now.",
			hint: "Loosen a filter and see who steps up.",
		}}
		request={{
			kind: "popular",
			...catalogFilters,
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
