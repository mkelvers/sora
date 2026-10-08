<script lang="ts">
	import { filterGroups, filters } from "$routes/(app)/(catalog)/catalog.svelte";

	const labels = $derived(
		filterGroups.flatMap((group) =>
			group.options
				.filter((option) => option.value && option.value === filters[group.id])
				.map((option) => option.label),
		),
	);
	const applied = $derived(labels.length > 1 ? labels.join(" ") : `All ${labels[0]}`);
</script>

{#if labels.length}
	<button
		type="button"
		class="group mt-1 inline-flex cursor-pointer gap-1 text-sm"
		aria-label="Reset filters: {applied}"
		onclick={() => {
			filters.audio = undefined;
			filters.format = undefined;
		}}
	>
		<span class="text-accent-secondary transition-colors group-hover:text-danger">
			Reset filters:
		</span>
		<span class="text-muted group-hover:line-through">{applied}</span>
	</button>
{/if}
