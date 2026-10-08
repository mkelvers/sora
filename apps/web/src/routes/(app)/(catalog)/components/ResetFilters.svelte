<script lang="ts">
	let {
		applied,
		onreset,
	}: {
		applied: string;
		onreset: () => void;
	} = $props();
</script>

<button
	type="button"
	class="group mt-1 inline-flex cursor-pointer gap-1 text-sm"
	aria-label="Reset filters: {applied}"
	onclick={onreset}
>
	<span class="text-accent-secondary transition-colors group-hover:text-danger">
		Reset filters:
	</span>
	<span class="text-muted group-hover:line-through">{applied}</span>
</button>
