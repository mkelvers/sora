<script lang="ts">
	import { page } from "$app/state";
	import Catalog from "$lib/components/Catalog.svelte";
	import CatalogControls from "$lib/components/CatalogControls.svelte";
	import CatalogReset from "$lib/components/CatalogReset.svelte";

	import type { PageProps } from "./$types";

	let { data }: PageProps = $props();

	const filters = $derived({
		audio: (["sub", "dub"] as const).find((value) => value === page.url.searchParams.get("audio")),
		format: (["TV", "MOVIE"] as const).find(
			(value) => value === page.url.searchParams.get("format"),
		),
	});
</script>

<svelte:head>
	<title>{data.genre} Anime · Sora</title>
</svelte:head>

{#key `${data.genre}:${filters.audio}:${filters.format}`}
	<Catalog
		title="{data.genre} Anime"
		empty="No {data.genre} anime are available yet."
		request={{
			kind: "genre",
			genre: data.genre,
			...filters,
		}}
	>
		{#snippet summary()}
			<CatalogReset kind="popular" genre={page.params.genre} {filters} />
		{/snippet}

		{#snippet controls()}
			<CatalogControls kind="popular" genre={page.params.genre} {filters} />
		{/snippet}
	</Catalog>
{/key}
