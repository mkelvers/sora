<script lang="ts">
	import { page } from "$app/state";
	import Catalog from "$lib/components/Catalog.svelte";
	import CatalogControls from "$lib/components/CatalogControls.svelte";
	import CatalogReset from "$lib/components/CatalogReset.svelte";

	const filters = $derived({
		audio: (["sub", "dub"] as const).find((value) => value === page.url.searchParams.get("audio")),
		format: (["TV", "MOVIE"] as const).find(
			(value) => value === page.url.searchParams.get("format"),
		),
	});
</script>

<svelte:head>
	<title>Newly Added · Sora</title>
</svelte:head>

{#key `${filters.audio}:${filters.format}`}
	<Catalog
		title="Newly Added Anime"
		empty="No anime were added in the last 30 days."
		request={{
			kind: "new",
			...filters,
		}}
	>
		{#snippet summary()}
			<CatalogReset kind="new" {filters} />
		{/snippet}

		{#snippet controls()}
			<CatalogControls kind="new" {filters} />
		{/snippet}
	</Catalog>
{/key}
