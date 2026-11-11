<script lang="ts">
	import Button from "$lib/components/ui/button.svelte";
	import { browseHref } from "$routes/(app)/(catalog)/browse/browse.svelte";
	import type { BrowseFilters } from "$routes/(app)/(catalog)/browse/browse.svelte";
	import { getTags } from "$routes/(app)/(catalog)/catalog.remote";
	import type { Series } from "@sora/sdk";

	let { series }: { series: Series } = $props();

	let expanded = $state(false);

	const offered = getTags();
	const tags = $derived.by(() => {
		const names = new Set((offered.current ?? []).map((tag) => tag.name));
		return series.tags
			.filter((tag) => !tag.spoiler && names.has(tag.name))
			.slice(0, 6)
			.map((tag) => tag.name);
	});
</script>

{#snippet links(label: string, names: string[], filter: (name: string) => Partial<BrowseFilters>)}
	{#if names.length}
		<div>
			<dt class="inline text-foreground">{label}:</dt>
			<dd class="inline">
				{#each names as name (name)}
					<span class="comma-separated">
						<a
							href={browseHref(filter(name))}
							class="underline underline-offset-2 transition-colors hover:text-foreground"
						>
							{name}
						</a>
					</span>
				{/each}
			</dd>
		</div>
	{/if}
{/snippet}

{#snippet row(label: string, values: string[])}
	{#if values.length}
		<div>
			<dt class="inline text-foreground">{label}:</dt>
			<dd class="inline">{values.join(", ")}</dd>
		</div>
	{/if}
{/snippet}

<section
	id="about"
	aria-label="About {series.title}"
	class={[
		"grid items-start gap-y-6 lg:grid-cols-[minmax(0,6fr)_minmax(0,5fr)] lg:gap-x-[10%]",
		!expanded && "max-h-24 overflow-hidden mask-b-from-50%",
	]}
>
	{#if series.synopsis}
		<p class="text-sm leading-6 lg:text-base lg:leading-6">{series.synopsis}</p>
	{/if}

	<div class="text-sm leading-6 text-muted lg:col-start-2">
		<dl class="flex flex-col gap-2.5">
			{@render row("Audio", series.audio_languages)}
			{@render row("Subtitles", series.subtitle_languages)}
			{@render row("Awards", series.awards)}
			{#if series.content_rating}
				<div>
					<dt class="inline text-foreground">Content advisory:</dt>
					<dd class="inline">
						{#if series.content_rating.age}
							<span
								class="mx-1.5 inline-block -skew-x-12 bg-border px-1.5 align-[0.1em] text-[0.6875rem] leading-4 font-bold text-foreground"
							>
								<span class="inline-block skew-x-12 italic">{series.content_rating.age}</span>
							</span>
						{/if}
						{series.content_rating.descriptors.join(", ")}
					</dd>
				</div>
			{/if}
			{@render links("Genres", series.genres, (genre) => ({
				genres: [genre],
			}))}
			{@render links("Tags", tags, (tag) => ({
				tags: [tag],
			}))}
			{@render links(
				series.studios.length > 1 ? "Studios" : "Studio",
				series.studios,
				(studio) => ({
					studios: [studio],
				}),
			)}
		</dl>
		{#if series.credit}
			<p class="mt-3 text-xs leading-6 font-bold text-subtle">{series.credit}</p>
		{/if}
	</div>
</section>

<div class="mt-2 border-b border-border pb-2">
	<Button
		variant="link"
		size="sm"
		aria-controls="about"
		aria-expanded={expanded}
		onclick={() => (expanded = !expanded)}
	>
		{expanded ? "Fewer details" : "More details"}
	</Button>
</div>
