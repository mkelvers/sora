<script lang="ts">
	import Button from "$lib/components/ui/button.svelte";
	import { cn } from "$lib/utils";
	import { getImages } from "$routes/(app)/series/[id]/media/media.remote";
	import type { Media } from "$routes/(app)/series/[id]/media/media.svelte";
	import { getSeries } from "$routes/(app)/series/[id]/series.remote";
	import type { Series } from "@sora/sdk";
	import { SparkleIcon } from "phosphor-svelte";

	let {
		series,
		media,
	}: {
		series: Series;
		media: Media;
	} = $props();

	const images = $derived(await getImages(series.id));
	const selected = $derived(
		images.find(
			(image) =>
				image.type === "backdrop" &&
				!image.upscaled &&
				series.backdrop_url?.split("/").at(-1) === image.url.split("/").at(-1),
		),
	);
	const upscaling = $derived(images.some((image) => image.upscale === "pending"));

	$effect(() => {
		if (!upscaling) {
			return;
		}

		const timer = setInterval(() => {
			getImages(series.id).refresh();
			getSeries(series.id).refresh();
		}, 5000);
		return () => clearInterval(timer);
	});
</script>

{#if selected && selected.upscale !== "done"}
	<Button variant="ghost" disabled={upscaling} onclick={() => media.upscale(selected.url)}>
		<SparkleIcon
			size="1rem"
			weight="bold"
			class={cn(upscaling && "animate-pulse motion-reduce:animate-none")}
		/>
		<span class="max-sm:sr-only">
			{#if upscaling}
				Upscaling
			{:else if selected.upscale === "failed"}
				Retry upscale
			{:else}
				Upscale
			{/if}
		</span>
	</Button>
{/if}
