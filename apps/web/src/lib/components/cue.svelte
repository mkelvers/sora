<script lang="ts" module>
	import { cva } from "class-variance-authority";

	const line = cva(
		"text-center font-subtitle leading-tight font-normal whitespace-pre-line text-white",
		{
			variants: {
				size: {
					large: "text-[150%]",
					medium: "",
					small: "text-[75%]",
				},
			},
		},
	);

	const text = cva("", {
		variants: {
			edge: {
				none: "",
				outline:
					"[-webkit-text-stroke:0.1em_#000] [paint-order:stroke_fill] [text-shadow:0_2px_3px_#000]",
				shadow: "[text-shadow:0_0_0.08em_#000,0_0_0.2em_rgb(0_0_0/0.9),0_0_0.45em_rgb(0_0_0/0.6)]",
			},
		},
	});
</script>

<script lang="ts">
	import type { SubtitleStyle } from "@sora/sdk";
	import type { Snippet } from "svelte";

	let {
		appearance,
		children,
	}: {
		appearance: SubtitleStyle;
		children: Snippet;
	} = $props();
</script>

<p
	class={line({
		size: appearance.size,
	})}
>
	<span
		class="box-decoration-clone px-[0.25em] py-[0.05em]"
		style:background-color="rgb(0 0 0 / {appearance.background_opacity}%)"
	>
		<span
			class={text({
				edge: appearance.edge,
			})}
		>
			{@render children()}
		</span>
	</span>
</p>
