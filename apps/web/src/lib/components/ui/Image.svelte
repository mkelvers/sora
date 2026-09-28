<script lang="ts">
	import { cn, tmdbImage } from "$lib/utils";
	import type { HTMLImgAttributes } from "svelte/elements";

	let {
		src,
		class: className,
		onready,
		...rest
	}: Omit<HTMLImgAttributes, "src" | "onload"> & {
		src: string;
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

<div class="relative size-full overflow-hidden bg-surface">
	{#if preview !== src}
		<img
			src={preview}
			alt=""
			class={cn(
				"size-full scale-110 object-cover blur-xl transition-opacity duration-300",
				className,
				loaded && "opacity-0",
			)}
			loading={rest.loading}
			decoding="async"
			aria-hidden="true"
		/>
	{/if}
	<img
		{...rest}
		{src}
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
</div>
