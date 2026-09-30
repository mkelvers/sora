<script lang="ts">
	import { catalogFilters } from "./CatalogControls.svelte";
	import ResetFilters from "./ResetFilters.svelte";

	const languages = {
		sub: "Subtitled",
		dub: "Dubbed",
	};

	const media = {
		TV: "Series",
		MOVIE: "Movies",
	};

	const applied = $derived(
		catalogFilters.audio && catalogFilters.format
			? `${languages[catalogFilters.audio]} ${media[catalogFilters.format]}`
			: `All ${catalogFilters.audio ? languages[catalogFilters.audio] : catalogFilters.format ? media[catalogFilters.format] : ""}`,
	);
</script>

{#if catalogFilters.audio || catalogFilters.format}
	<ResetFilters
		{applied}
		onreset={() => {
			catalogFilters.audio = undefined;
			catalogFilters.format = undefined;
		}}
	/>
{/if}
