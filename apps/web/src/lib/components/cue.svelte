<script lang="ts" module>
	import type { SubtitleStyle } from "@sora/sdk";
	import { cva } from "class-variance-authority";

	const line = cva("text-center font-subtitle leading-tight font-normal whitespace-pre-line", {
		variants: {
			size: {
				large: "text-[150%]",
				medium: "",
				small: "text-[75%]",
			},
		},
	});

	const text = cva("", {
		variants: {
			edge: {
				none: "",
				outline:
					"[-webkit-text-stroke:var(--edge-width)_var(--edge)] [paint-order:stroke_fill] [text-shadow:0_0.04em_0.06em_var(--edge)]",
				shadow:
					"[text-shadow:0_0_calc(var(--edge-width)*0.8)_var(--edge),0_0_calc(var(--edge-width)*2)_var(--edge),0_0_calc(var(--edge-width)*4)_var(--edge)]",
			},
			width: {
				medium: "[--edge-width:0.1em]",
				thick: "[--edge-width:0.16em]",
				thin: "[--edge-width:0.06em]",
			},
		},
	});

	const colors: Record<SubtitleStyle["text_color"], string> = {
		black: "#000000",
		blue: "#0000ff",
		cyan: "#00ffff",
		green: "#00ff00",
		magenta: "#ff00ff",
		red: "#ff0000",
		white: "#ffffff",
		yellow: "#ffff00",
	};
</script>

<script lang="ts">
	import type { Snippet } from "svelte";

	let {
		appearance,
		children,
	}: {
		appearance: SubtitleStyle;
		children: Snippet;
	} = $props();

	const background = $derived(
		`color-mix(in srgb, ${colors[appearance.background_color]} ${appearance.background_opacity}%, transparent)`,
	);
</script>

<p
	class={line({
		size: appearance.size,
	})}
>
	<span class="box-decoration-clone px-[0.25em] py-[0.05em]" style:background-color={background}>
		<span
			class={text({
				edge: appearance.edge,
				width: appearance.edge_width,
			})}
			style:color={colors[appearance.text_color]}
			style:--edge={appearance.text_color === "black" ? colors.white : colors.black}
		>
			{@render children()}
		</span>
	</span>
</p>
