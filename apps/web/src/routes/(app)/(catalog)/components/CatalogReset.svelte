<script lang="ts">
	import { filters } from "$routes/(app)/(catalog)/catalog.svelte";

	import ResetFilters from "./ResetFilters.svelte";

	const languages = {
		sub: "Subtitled",
		dub: "Dubbed",
	};

	const media = {
		TV: "Series",
		MOVIE: "Movies",
	};

	const applied = $derived.by(() => {
		const labels = [
			filters.audio && languages[filters.audio],
			filters.format && media[filters.format],
		]
			.filter(Boolean)
			.join(" ");
		return filters.audio && filters.format ? labels : `All ${labels}`;
	});
</script>

{#if filters.audio || filters.format}
	<ResetFilters
		{applied}
		onreset={() => {
			filters.audio = undefined;
			filters.format = undefined;
		}}
	/>
{/if}
