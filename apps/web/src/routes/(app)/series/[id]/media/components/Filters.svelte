<script lang="ts">
	import Button from "$lib/components/ui/Button.svelte";
	import { languages as languageNames } from "$lib/utils";
	import { getImages } from "$routes/(app)/series/[id]/media/media.remote";
	import type { Media } from "$routes/(app)/series/[id]/media/media.svelte";

	type Props = {
		seriesId: string;
		media: Media;
	};

	let { seriesId, media }: Props = $props();

	const allImages = $derived(await getImages(seriesId));
	const images = $derived(allImages.filter((image) => image.type === media.type));

	const languages = $derived.by(() => {
		const groups = Map.groupBy(images, (image) => image.language ?? "none");
		const languages = [...groups].map(([code, images]) => ({
			code,
			count: images.length,
		}));

		return languages.toSorted((a, b) => {
			if (a.code === "none") {
				return -1;
			}

			if (b.code === "none") {
				return 1;
			}

			return b.count - a.count;
		});
	});

	function toggle(code: string) {
		media.languages = media.languages.includes(code)
			? media.languages.filter((language) => language !== code)
			: [...media.languages, code];
	}
</script>

{#if languages.length > 1}
	<section>
		<h2 class="mb-2 px-2 text-xs font-bold tracking-wide text-subtle uppercase">Language</h2>
		<div class="grid" role="group" aria-label="Language">
			{#each [{ code: "", count: images.length }, ...languages] as language (language.code)}
				<Button
					aria-pressed={language.code
						? media.languages.includes(language.code)
						: media.languages.length === 0}
					variant="item"
					class="min-h-9 gap-3 px-2 py-0"
					onclick={() => (language.code ? toggle(language.code) : (media.languages = []))}
				>
					<span class="min-w-0 truncate">
						{#if language.code === ""}
							All
						{:else if language.code === "none"}
							Textless
						{:else}
							{languageNames.of(language.code)}
						{/if}
					</span>
					<span class="ml-auto text-xs text-subtle tabular-nums">{language.count}</span>
				</Button>
			{/each}
		</div>
	</section>
{/if}
