<script lang="ts">
	import Button from "$lib/components/ui/button.svelte";
	import { getImages } from "$routes/(app)/series/[id]/media/media.remote";
	import type { Media } from "$routes/(app)/series/[id]/media/media.svelte";
	import { getDetails } from "$routes/(app)/series/[id]/series.remote";
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

	const working = $derived(
		images.some((image) => image.upscale === "queued" || image.upscale === "upscaling"),
	);

	$effect(() => {
		if (!working) {
			return;
		}

		const timer = setInterval(() => {
			getImages(series.id).refresh();
			getDetails(series.id).refresh();
		}, 5000);

		return () => clearInterval(timer);
	});
</script>

{#if selected && (selected.upscale === null || selected.upscale === "failed")}
	<Button variant="ghost" disabled={media.upscaling} onclick={() => media.upscale(selected.url)}>
		<SparkleIcon size="1rem" weight="bold" />
		<span class="max-sm:sr-only">
			{selected.upscale === "failed" ? "Retry upscale" : "Upscale"}
		</span>
	</Button>
{/if}
