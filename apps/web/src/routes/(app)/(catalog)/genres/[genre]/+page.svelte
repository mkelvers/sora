<script lang="ts">
	import Catalog from "$routes/(app)/(catalog)/components/Catalog.svelte";
	import CatalogControls, {
		catalogFilters,
	} from "$routes/(app)/(catalog)/components/CatalogControls.svelte";
	import CatalogReset from "$routes/(app)/(catalog)/components/CatalogReset.svelte";

	import type { PageProps } from "./$types";

	let { data }: PageProps = $props();
</script>

<svelte:head>
	<title>{data.genre} Anime · Sora</title>
</svelte:head>

{#key `${data.genre}:${catalogFilters.audio}:${catalogFilters.format}`}
	<Catalog
		title="{data.genre} Anime"
		empty={{
			title: `No ${data.genre} anime to show just yet.`,
			hint: "Loosen a filter and see what turns up.",
		}}
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
