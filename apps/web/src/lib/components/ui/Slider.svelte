<script lang="ts">
	import { cn } from "$lib/utils";
	import type { HTMLInputAttributes } from "svelte/elements";

	let {
		value = $bindable(),
		min = 0,
		max,
		fill,
		buffered,
		class: className,
		...props
	}: Omit<HTMLInputAttributes, "type" | "value" | "min" | "max"> & {
		value: number;
		min?: number;
		max: number;
		fill?: number;
		buffered?: number;
	} = $props();

	const ratio = $derived(fill ?? (max > min ? (value - min) / (max - min) : 0));
</script>

<input
	{...props}
	type="range"
	{min}
	{max}
	bind:value
	class={cn(
		"my-2.5 h-1 cursor-pointer appearance-none bg-[linear-gradient(to_right,#fff_var(--fill-end),rgb(255_255_255/0.4)_var(--fill-end)_var(--buffer-end),rgb(255_255_255/0.2)_var(--buffer-end))] [--buffer-end:calc(var(--buffered,var(--fill))*100%)] [--fill-end:calc(var(--fill)*100%)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent [&::-moz-range-thumb]:size-3.5 [&::-moz-range-thumb]:border-none [&::-moz-range-thumb]:bg-white [&::-webkit-slider-thumb]:size-3.5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:bg-white",
		className,
	)}
	style:--fill={ratio}
	style:--buffered={buffered}
/>
