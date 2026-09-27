<script lang="ts">
	import type { Series } from "@sora/sdk";
	import Icon, { type IconName } from "$lib/components/ui/Icon.svelte";

	type Props = {
		series: Series;
	};

	let {
		series,
	}: Props = $props();

	type Status = NonNullable<Series["status"]>;

	type Row = {
		glyph: Status | "GENRES" | "THEMES" | "STUDIO";
		term: string;
		value: string;
	};

	const statuses: Record<Status, string> = {
		FINISHED: "Finished",
		RELEASING: "Airing",
		NOT_YET_RELEASED: "Upcoming",
		CANCELLED: "Cancelled",
		HIATUS: "On hiatus",
	};

	const glyphs: Record<Row["glyph"], IconName> = {
		FINISHED: "check",
		RELEASING: "live",
		NOT_YET_RELEASED: "schedule",
		CANCELLED: "close",
		HIATUS: "pause",
		GENRES: "label",
		THEMES: "hash",
		STUDIO: "movie",
	};

	const rows = $derived(
		[
			series.status && {
				glyph: series.status,
				term: "Status",
				value: statuses[series.status],
			},
			{
				glyph: "GENRES",
				term: "Genres",
				value: series.genres.join(", "),
			},
			{
				glyph: "THEMES",
				term: "Themes",
				value: series.tags
					.filter((tag) => !tag.spoiler && (tag.rank ?? 0) >= 60)
					.slice(0, 8)
					.map((tag) => tag.name)
					.join(", "),
			},
			{
				glyph: "STUDIO",
				term: series.studios.length > 1 ? "Studios" : "Studio",
				value: series.studios.join(", "),
			},
		].filter((row): row is Row => Boolean(row?.value)),
	);
</script>

{#if rows.length}
	<dl>
		{#each rows as row (row.term)}
			<div>
				<dt>
					<Icon name={glyphs[row.glyph]} size="sm" />
					<span class="term">{row.term}</span>
				</dt>
				<dd>{row.value}</dd>
			</div>
		{/each}
	</dl>
{/if}

<style>
	dl {
		display: grid;
		gap: 12px;
		margin: 0;
	}

	div {
		display: flex;
		align-items: flex-start;
		gap: 10px;
	}

	dt {
		display: flex;
		flex: none;
		padding-top: 1px;
		color: #fff;
	}

	.term {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
	}

	dd {
		margin: 0;
		color: #ccc;
		font-size: 14px;
		line-height: 1.45;
	}
</style>
