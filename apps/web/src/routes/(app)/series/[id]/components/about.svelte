<script lang="ts">
	import { slug } from "$routes/(app)/(catalog)/genres/slug";
	import type { Series } from "@sora/sdk";

	let { series }: { series: Series } = $props();
</script>

{#snippet row(label: string, values: string[])}
	{#if values.length}
		<div>
			<dt class="inline text-foreground">{label}:</dt>
			<dd class="inline">{values.join(", ")}</dd>
		</div>
	{/if}
{/snippet}

<section
	aria-label="About {series.title}"
	class="grid items-start gap-y-6 lg:grid-cols-[minmax(0,6fr)_minmax(0,5fr)] lg:gap-x-[10%]"
>
	{#if series.overview}
		<p class="text-sm leading-6 lg:text-base lg:leading-6">{series.overview}</p>
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
								class="mr-1 inline-block bg-border px-1 align-[0.1em] text-[0.6875rem] leading-4 font-bold text-foreground italic"
							>
								{series.content_rating.age}
							</span>
						{/if}
						{series.content_rating.descriptors.join(", ")}
					</dd>
				</div>
			{/if}
			{#if series.genres.length}
				<div>
					<dt class="inline text-foreground">Genres:</dt>
					<dd class="inline">
						{#each series.genres as genre (genre)}
							<span class="comma-separated">
								<a
									href="/genres/{slug(genre)}"
									class="underline underline-offset-2 transition-colors hover:text-foreground"
								>
									{genre}
								</a>
							</span>
						{/each}
					</dd>
				</div>
			{/if}
		</dl>
		{#if series.credit}
			<p class="mt-3 text-xs leading-6 font-bold text-subtle">{series.credit}</p>
		{/if}
	</div>
</section>
