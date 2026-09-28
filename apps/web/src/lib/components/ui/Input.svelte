<script lang="ts">
	import type { HTMLInputAttributes } from 'svelte/elements'
	import { cn } from '$lib/utils'

	let { class: className, value = $bindable(), ...props }: HTMLInputAttributes = $props()
</script>

<input
	{...props}
	bind:value
	class={cn(
		'flex h-10 w-full border border-border bg-transparent px-3 py-2 text-sm outline-none transition-[border-color,box-shadow] duration-150 ease-out placeholder:text-muted focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/30 disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none',
		className
	)}
/>
