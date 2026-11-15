<script lang="ts" module>
	import type { SubtitleStyle } from "@sora/sdk";
	import { cva } from "class-variance-authority";

	const text = cva("", {
		variants: {
			edge: {
				none: "",
				outline:
					"[-webkit-text-stroke:0.1em_var(--edge)] [paint-order:stroke_fill] [text-shadow:0_2px_3px_var(--edge)]",
				shadow: "[text-shadow:0.05em_0.05em_0.1em_var(--edge),0_0_0.2em_var(--edge)]",
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
	class="text-center leading-tight font-semibold tracking-[0.02em] whitespace-pre-line"
	style:font-size="{appearance.size}%"
>
	<span class="box-decoration-clone px-[0.25em] py-[0.05em]" style:background-color={background}>
		<span
			class={text({
				edge: appearance.edge,
			})}
			style:color={colors[appearance.text_color]}
			style:opacity="{appearance.text_opacity}%"
			style:--edge={appearance.text_color === "black" ? colors.white : colors.black}
		>
			{@render children()}
		</span>
	</span>
</p>
