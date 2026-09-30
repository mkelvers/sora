<script lang="ts">
	import Button from "$lib/components/ui/Button.svelte";
	import Select from "$lib/components/ui/Select.svelte";
	import { languages as languageNames } from "$lib/utils";
	import { getImages } from "$routes/(protected)/(browse)/series/[id]/media/media.remote";
	import type { Media } from "$routes/(protected)/(browse)/series/[id]/media/media.svelte";

	type Props = {
		seriesId: string;
		media: Media;
	};

	let { seriesId, media }: Props = $props();

	const images = $derived((await getImages(seriesId)).filter((image) => image.type === media.type));

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

	const seasons = $derived.by(() => {
		const numbers = new Set(images.map((image) => image.season_number));

		return [...numbers].filter((number) => number !== null).toSorted((a, b) => a - b);
	});

	const sources = $derived([
		{
			value: "all",
			label: "Any season",
		},
		{
			value: "series",
			label: "The whole title",
		},
		...seasons.map((number) => ({
			value: String(number),
			label: number === 0 ? "Specials" : `Season ${number}`,
		})),
	]);

	function toggle(code: string) {
		media.languages = media.languages.includes(code)
			? media.languages.filter((language) => language !== code)
			: [...media.languages, code];
	}
</script>

<section>
	<h2 class="mb-3 text-xs font-bold tracking-wide text-subtle uppercase">Sort by</h2>
	<Select
		variant="field"
		label="Sort by"
		options={[
			{
				value: "votes",
				label: "Most liked",
			},
			{
				value: "quality",
				label: "Best quality",
			},
		]}
		bind:value={() => media.sort, (value) => (media.sort = value as Media["sort"])}
	/>
</section>

{#if seasons.length > 0}
	<section>
		<h2 class="mb-3 text-xs font-bold tracking-wide text-subtle uppercase">Made for</h2>
		<Select
			variant="field"
			label="Made for"
			options={sources}
			bind:value={() => media.source, (value) => (media.source = value)}
		/>
	</section>
{/if}

{#if languages.length > 1}
	<section>
		<h2 class="mb-2 text-xs font-bold tracking-wide text-subtle uppercase">Language</h2>
		<div class="grid" role="group" aria-label="Language">
			{#each [{ code: "", count: images.length }, ...languages] as language (language.code)}
				{@const pressed = language.code
					? media.languages.includes(language.code)
					: media.languages.length === 0}
				<Button
					aria-pressed={pressed}
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
