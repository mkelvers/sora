<script lang="ts" module>
	import type { SubtitleStyle } from "@sora/sdk";
	import { cva } from "class-variance-authority";

	const line = cva(
		"grid text-center font-subtitle leading-[1.2] font-normal whitespace-pre-line *:[grid-area:1/1]",
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

	const edging = cva("", {
		variants: {
			edge: {
				none: "text-transparent",
				outline:
					"text-(--edge) [-webkit-text-stroke:calc(var(--edge-width)*2)_var(--edge)] [text-shadow:0_0.04em_0.06em_var(--edge)]",
				shadow:
					"text-(--edge) [text-shadow:0_0_calc(var(--edge-width)*1.6)_var(--edge),0_0_calc(var(--edge-width)*4)_var(--edge),0_0_calc(var(--edge-width)*8)_var(--edge)]",
			},
			width: {
				medium: "[--edge-width:0.05em]",
				thick: "[--edge-width:0.08em]",
				thin: "[--edge-width:0.03em]",
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
	style:--edge={appearance.text_color === "black" ? colors.white : colors.black}
>
	<span
		aria-hidden="true"
		class={edging({
			edge: appearance.edge,
			width: appearance.edge_width,
		})}
	>
		<span class="box-decoration-clone" style:background-color={background}>
			{@render children()}
		</span>
	</span>
	<span style:color={colors[appearance.text_color]}>{@render children()}</span>
</p>
