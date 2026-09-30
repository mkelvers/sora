<script lang="ts">
	import { catalogFilters } from "./CatalogControls.svelte";

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
	<button
		type="button"
		class="group mt-1 inline-flex cursor-pointer gap-1 text-sm"
		aria-label="Reset filters: {applied}"
		onclick={() => {
			catalogFilters.audio = undefined;
			catalogFilters.format = undefined;
		}}
	>
		<span class="text-accent-secondary transition-colors group-hover:text-status-error">
			Reset Filters:
		</span>
		<span class="text-muted group-hover:line-through">{applied}</span>
	</button>
{/if}
