<script lang="ts">
	import Button from "$lib/components/ui/Button.svelte";

	let {
		applied,
		onreset,
	}: {
		applied: string;
		onreset: () => void;
	} = $props();
</script>

<Button
	variant="link"
	class="group mt-1 gap-1 text-sm text-inherit no-underline hover:no-underline"
	aria-label="Reset filters: {applied}"
	onclick={onreset}
>
	<span class="text-accent-secondary transition-colors group-hover:text-status-error">
		Reset Filters:
	</span>
	<span class="text-muted group-hover:line-through">{applied}</span>
</Button>
