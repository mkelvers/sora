<script lang="ts">
	import { cn } from "$lib/utils";
	import { CircleNotchIcon } from "phosphor-svelte";

	interface Props {
		size?: string;
		class?: string;
		label?: string;
	}

	let { size = "2rem", class: className, label }: Props = $props();
</script>

<CircleNotchIcon
	{size}
	weight="bold"
	class={cn("animate-spin text-accent motion-reduce:animate-none", className)}
	role={label ? "status" : undefined}
	aria-label={label}
	aria-hidden={label ? undefined : "true"}
/>
