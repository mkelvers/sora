<script lang="ts">
	import Button from "$lib/components/ui/Button.svelte";
	import { XIcon } from "phosphor-svelte";

	let {
		applied,
		onreset,
	}: {
		applied: string;
		onreset: () => void;
	} = $props();
</script>

<Button
	variant="ghost"
	size="sm"
	class="-ml-2"
	aria-label="Reset filters: {applied}"
	onclick={onreset}
>
	{applied}
	<XIcon size="0.875rem" weight="bold" />
</Button>
