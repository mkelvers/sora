<script lang="ts">
	let {
		kind,
		genre,
		filters,
	}: {
		kind: "new" | "popular";
		genre?: string;
		filters: {
			audio?: "sub" | "dub";
			format?: "TV" | "MOVIE";
		};
	} = $props();

	const languages = {
		sub: "Subtitled",
		dub: "Dubbed",
	};

	const media = {
		TV: "Series",
		MOVIE: "Movies",
	};

	const applied = $derived(
		filters.audio && filters.format
			? `${languages[filters.audio]} ${media[filters.format]}`
			: `All ${filters.audio ? languages[filters.audio] : filters.format ? media[filters.format] : ""}`,
	);
</script>

{#if filters.audio || filters.format}
	<a
		href={genre ? `/genres/${genre}` : `/${kind}`}
		class="group mt-1 inline-flex gap-1 text-sm"
		aria-label="Reset filters: {applied}"
	>
		<span class="text-accent-secondary transition-colors group-hover:text-status-error">
			Reset Filters:
		</span>
		<span class="text-muted group-hover:line-through">{applied}</span>
	</a>
{/if}
