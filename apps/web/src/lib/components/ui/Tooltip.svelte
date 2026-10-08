<script lang="ts">
	import { Tooltip } from "melt/builders";
	import type { Snippet } from "svelte";

	let {
		text,
		children,
		placement = "top",
	}: {
		text: string;
		children: Snippet<[Tooltip["trigger"]]>;
		placement?: "top" | "bottom";
	} = $props();

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
	class="inset-auto m-0 min-h-9 w-max items-center overflow-visible bg-raised px-3 text-sm leading-none whitespace-nowrap text-foreground shadow-lg transition-opacity duration-100 open:flex starting:opacity-0"
>
	{text}
</div>
