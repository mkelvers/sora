<script lang="ts">
	import { Tooltip } from "melt/builders";
	import type { Snippet } from "svelte";

	interface Props {
		text: string;
		children: Snippet<[Tooltip["trigger"]]>;
		placement?: "top" | "bottom";
	}

	let { text, children, placement = "top" }: Props = $props();

	const tooltip = new Tooltip({
		openDelay: 0,
		disableHoverableContent: true,
		floatingConfig: () => ({
			computePosition: {
				placement,
			},
		}),
	});
</script>

{@render children(tooltip.trigger)}

<div
	{...tooltip.content}
	class="inset-auto m-0 min-h-11 w-max items-center overflow-visible bg-tooltip px-3 text-sm leading-none font-normal whitespace-nowrap text-tooltip-foreground transition-opacity duration-100 open:flex starting:opacity-0"
>
	{text}
</div>
