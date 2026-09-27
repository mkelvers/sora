<script lang="ts">
	import type { Series } from "@sora/sdk";

	type Props = {
		series: Series;
	};

	let { series }: Props = $props();

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
					<svg
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="1.5"
						stroke-linecap="round"
						stroke-linejoin="round"
						aria-hidden="true"
					>
						{#if row.glyph === "FINISHED"}
							<circle cx="12" cy="12" r="8.5" />
							<path d="M8.5 12.2l2.3 2.3 4.7-4.8" />
						{:else if row.glyph === "RELEASING"}
							<path stroke-width="2.5" d="M12 12h.01" />
							<path
								d="M8.8 8.8a4.5 4.5 0 0 0 0 6.4M15.2 8.8a4.5 4.5 0 0 1 0 6.4M6 6a8.5 8.5 0 0 0 0 12M18 6a8.5 8.5 0 0 1 0 12"
							/>
						{:else if row.glyph === "NOT_YET_RELEASED"}
							<circle cx="12" cy="12" r="8.5" />
							<path d="M12 7.5V12l3 2" />
						{:else if row.glyph === "CANCELLED"}
							<circle cx="12" cy="12" r="8.5" />
							<path d="M9.5 9.5l5 5M14.5 9.5l-5 5" />
						{:else if row.glyph === "HIATUS"}
							<circle cx="12" cy="12" r="8.5" />
							<path d="M10 9.5v5M14 9.5v5" />
						{:else if row.glyph === "GENRES"}
							<path
								d="M3.5 11.6V5A1.5 1.5 0 0 1 5 3.5h6.6a1.5 1.5 0 0 1 1.06.44l7.4 7.4a1.5 1.5 0 0 1 0 2.12l-6.6 6.6a1.5 1.5 0 0 1-2.12 0l-7.4-7.4A1.5 1.5 0 0 1 3.5 11.6Z"
							/>
							<path stroke-width="2.5" d="M8 8h.01" />
						{:else if row.glyph === "THEMES"}
							<path d="M9.5 4 7.5 20M16.5 4l-2 16M4.5 9h15.5M4 15h15.5" />
						{:else}
							<path d="M3.5 9.5h17V18a2.5 2.5 0 0 1-2.5 2.5H6A2.5 2.5 0 0 1 3.5 18V9.5Z" />
							<path d="M3.5 9.5V6.5a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2v3M9.5 4.5l-2.5 5M15.5 4.5l-2.5 5" />
						{/if}
					</svg>
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

	svg {
		width: 17px;
		height: 17px;
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
