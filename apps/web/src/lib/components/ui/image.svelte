<script lang="ts">
	import { cn } from "$lib/utils";
	import type { HTMLImgAttributes } from "svelte/elements";

	let {
		src,
		alt,
		class: className,
		loading = "lazy",
		onready,
		...rest
	}: Omit<HTMLImgAttributes, "src" | "alt" | "onload"> & {
		src: string;
		alt: string;
		onready?: () => void;
	} = $props();

	let loaded = $state(false);
</script>

<picture class="relative block size-full overflow-hidden bg-surface">
	<img
		{...rest}
		{src}
		{alt}
		{loading}
		class={cn(
			"absolute inset-0 size-full object-cover transition-opacity duration-300",
			className,
			!loaded && "opacity-0",
		)}
		decoding="async"
		onload={() => {
			loaded = true;
			onready?.();
		}}
	/>
</picture>
