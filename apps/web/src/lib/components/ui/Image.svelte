<script lang="ts">
	import { cn, tmdbImage } from "$lib/utils";
	import type { HTMLImgAttributes } from "svelte/elements";

	let {
		src,
		alt,
		class: className,
		onready,
		...rest
	}: Omit<HTMLImgAttributes, "src" | "alt" | "onload"> & {
		src: string;
		alt: string;
		onready?: () => void;
	} = $props();

	let loaded = $state(false);

	const preview = $derived(
		tmdbImage(src, "w300").replace(
			/(\/anilistcdn\/media\/anime\/cover\/)(?:extraLarge|large)(?=\/|$)/,
			"$1medium",
		),
	);
</script>

<picture
	class={cn(
		"relative block size-full overflow-hidden bg-surface",
		preview !== src &&
			"before:absolute before:inset-0 before:scale-110 before:bg-(image:--preview) before:bg-cover before:bg-center before:blur-xl before:transition-opacity before:duration-300",
		loaded && "before:opacity-0",
	)}
	style:--preview="url({preview})"
>
	<img
		{...rest}
		{src}
		{alt}
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
