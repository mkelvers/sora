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
	<title>Most Popular · Sora</title>
</svelte:head>

{#key `${filters.audio}:${filters.format}`}
	<Catalog
		title="Most Popular Anime"
		empty="No anime are available yet."
		request={{
			kind: "popular",
			...filters,
		}}
	>
		{#snippet summary()}
			<CatalogReset kind="popular" {filters} />
		{/snippet}

		{#snippet controls()}
			<CatalogControls kind="popular" {filters} />
		{/snippet}
	</Catalog>
{/key}
