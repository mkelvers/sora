<script lang="ts">
	import type { Series } from "@sora/sdk";

	type Props = {
		series: Series;
	};

	let { series }: Props = $props();

	const statuses: Record<NonNullable<Series["status"]>, string> = {
		FINISHED: "Finished",
		RELEASING: "Airing",
		NOT_YET_RELEASED: "Upcoming",
		CANCELLED: "Cancelled",
		HIATUS: "On hiatus",
	};

	const rows = $derived(
		[
			["Status", series.status && statuses[series.status]],
			["Genres", series.genres.join(", ")],
			[
				series.studios.length > 1 ? "Studios" : "Studio",
				series.studios.join(", "),
			],
		].filter((row): row is [string, string] => Boolean(row[1])),
	);
</script>

{#if rows.length}
	<dl>
		{#each rows as [term, value] (term)}
			<div>
				<dt>{term}</dt>
				<dd>{value}</dd>
			</div>
		{/each}
	</dl>
{/if}

<style>
	dl {
		display: grid;
		gap: 16px;
		margin: 0;
	}

	dt {
		margin-bottom: 4px;
		color: #777;
		font-size: 12px;
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}

	dd {
		margin: 0;
		color: #ccc;
		font-size: 14px;
		line-height: 1.45;
	}
</style>
