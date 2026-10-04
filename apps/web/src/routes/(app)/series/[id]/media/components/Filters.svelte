<script lang="ts">
	import Button from "$lib/components/ui/Button.svelte";
	import { languages as names } from "$lib/utils";
	import { getImages } from "$routes/(app)/series/[id]/media/media.remote";
	import type { Media } from "$routes/(app)/series/[id]/media/media.svelte";

	let {
		seriesId,
		media,
	}: {
		seriesId: string;
		media: Media;
	} = $props();

	const images = $derived((await getImages(seriesId)).filter((image) => image.type === media.type));
	const languages = $derived(
		[...Map.groupBy(images, (image) => image.language ?? "none")]
			.map(([code, group]) => ({
				code,
				count: group.length,
			}))
			.toSorted(
				(a, b) => Number(b.code === "none") - Number(a.code === "none") || b.count - a.count,
			),
	);
</script>

{#snippet row(label: string, count: number, pressed: boolean, onclick: () => void)}
	<Button aria-pressed={pressed} variant="item" class="min-h-9 gap-3 px-2 py-0" {onclick}>
		<span class="min-w-0 truncate">{label}</span>
		<span class="ml-auto text-xs text-subtle tabular-nums">{count}</span>
	</Button>
{/snippet}

{#if languages.length > 1}
	<section>
		<h2 class="mb-2 px-2 text-xs font-bold tracking-wide text-subtle uppercase">Language</h2>
		<div class="grid" role="group" aria-label="Language">
			{@render row("All", images.length, !media.languages.length, () => (media.languages = []))}
			{#each languages as { code, count } (code)}
				{@render row(
					code === "none" ? "Textless" : (names.of(code) ?? code),
					count,
					media.languages.includes(code),
					() => media.toggle(code),
				)}
			{/each}
		</div>
	</section>
{/if}
