<script lang="ts">
	import Catalog from "$lib/components/Catalog.svelte";
	import CatalogControls, { catalogFilters } from "$lib/components/CatalogControls.svelte";
	import CatalogReset from "$lib/components/CatalogReset.svelte";

	import type { PageProps } from "./$types";

	let { data }: PageProps = $props();
</script>

<svelte:head>
	<title>{data.genre} Anime · Sora</title>
</svelte:head>

{#key `${data.genre}:${catalogFilters.audio}:${catalogFilters.format}`}
	<Catalog
		title="{data.genre} Anime"
		empty="No {data.genre} anime are available yet."
		request={{
			kind: "genre",
			genre: data.genre,
			...catalogFilters,
		}}
	>
		{#snippet summary()}
			<CatalogReset />
		{/snippet}

		{#snippet controls()}
			<CatalogControls />
		{/snippet}
	</Catalog>
{/key}
