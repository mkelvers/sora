<script lang="ts">
	import { filters } from "$routes/(app)/(catalog)/catalog.svelte";
	import Catalog from "$routes/(app)/(catalog)/components/Catalog.svelte";
	import CatalogControls from "$routes/(app)/(catalog)/components/CatalogControls.svelte";
	import CatalogReset from "$routes/(app)/(catalog)/components/CatalogReset.svelte";

	import type { PageProps } from "./$types";

	let { data }: PageProps = $props();
</script>

<svelte:head>
	<title>{data.genre} Anime · Sora</title>
</svelte:head>

{#key `${data.genre}:${filters.audio}:${filters.format}`}
	<Catalog
		title="{data.genre} Anime"
		empty={{
			title: `No ${data.genre} anime to show just yet.`,
			hint: "Loosen a filter and see what turns up.",
		}}
		request={{
			kind: "genre",
			genre: data.genre,
			...filters,
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
