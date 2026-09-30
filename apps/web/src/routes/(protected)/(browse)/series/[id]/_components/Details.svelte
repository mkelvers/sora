<script lang="ts">
	import Button from "$lib/components/ui/Button.svelte";
	import { cn } from "$lib/utils";
	import type { Series } from "@sora/sdk";

	let {
		series,
	}: {
		series: Series;
	} = $props();

	let expanded = $state(false);
	let overflowing = $state(false);
	let details = $state<HTMLElement>();

	$effect(() => {
		if (!details) {
			return;
		}

		const section = details;
		const observer = new ResizeObserver(() => {
			overflowing =
				section.scrollHeight >
				parseFloat(getComputedStyle(document.documentElement).fontSize) * 6 + 1;
		});
		observer.observe(section);
		for (const child of section.children) {
			observer.observe(child);
		}

		return () => observer.disconnect();
	});
</script>

<div class="relative z-20 bg-canvas px-5 sm:px-10 lg:px-16">
	<div class={cn("pt-7 lg:pt-8", !overflowing && "pb-7 lg:pb-8")}>
		<div
			class={cn(
				"grid transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none",
				expanded || !overflowing ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
			)}
		>
			<section
				bind:this={details}
				id="series-details"
				aria-label="Synopsis"
				inert={overflowing && !expanded}
				class={cn(
					"grid max-w-432 min-w-0 grid-cols-1 gap-8 overflow-hidden text-xs leading-5 text-muted md:grid-cols-2 md:gap-12 lg:gap-28 lg:text-sm lg:leading-6",
					overflowing ? "min-h-24" : "min-h-0",
					overflowing &&
						!expanded &&
						"mask-[linear-gradient(to_bottom,black_45%,transparent_100%)]",
				)}
			>
				{#if series.overview}
					<p class="max-w-3xl text-foreground">{series.overview}</p>
				{/if}
			</section>
		</div>

		{#if overflowing}
			<Button
				variant="text"
				aria-expanded={expanded}
				aria-controls="series-details"
				onclick={() => (expanded = !expanded)}
			>
				{#if expanded}
					Fewer details
				{:else}
					More details
				{/if}
			</Button>
		{/if}
	</div>
</div>
