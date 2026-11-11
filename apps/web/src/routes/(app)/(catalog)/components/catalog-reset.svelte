<script lang="ts">
	let {
		labels,
		onreset,
	}: {
		labels: string[];
		onreset: () => void;
	} = $props();

	const applied = $derived(labels.length > 1 ? labels.join(", ") : `All ${labels[0]}`);
</script>

{#if labels.length}
	<button
		type="button"
		class="group mt-1 inline-flex cursor-pointer gap-1 text-left text-sm"
		aria-label="Reset filters: {applied}"
		onclick={onreset}
	>
		<span class="shrink-0 text-accent-secondary transition-colors group-hover:text-danger">
			Reset filters:
		</span>
		<span class="text-muted group-hover:line-through">{applied}</span>
	</button>
{/if}
