<script lang="ts">
	import type { ContinueWatchingItem, LibraryTitle, Season, Series } from "@sora/sdk";
	import Button from "$lib/components/ui/Button.svelte";
	import Dropdown from "$lib/components/ui/Dropdown.svelte";
	import Icon from "$lib/components/ui/Icon.svelte";
	import Tooltip from "$lib/components/ui/Tooltip.svelte";
	import { getListed, setListed } from "$lib/watchlist.remote";
	import { clearProgress, markAllWatched, setDropped } from "../series.remote";

	type Props = {
		series: Series;
		season: Season;
		resume: ContinueWatchingItem | null;
		library: LibraryTitle;
		seasonWatched: boolean;
	};

	let {
		series,
		season,
		resume,
		library,
		seasonWatched,
	}: Props = $props();

	const listing = getListed();
	const listed = $derived(listing.current?.includes(series.id) ?? library.listed);

	const play = $derived.by(() => {
		if (resume) {
			const season = series.seasons.find((season) => season.id === resume.season_id);
			const where =
				series.seasons.length > 1 && season
					? `${season.title}, episode ${resume.episode}`
					: `episode ${resume.episode}`;

			return {
				href: `/series/${series.id}/watch/${resume.season_id}/${resume.episode}`,
				label: `${resume.position_seconds > 0 ? "Resume" : "Play"} ${where}`,
			};
		}

		const first =
			series.seasons.find((season) => season.in_watch_order) ?? series.seasons[0];

		return (
			first && {
				href: `/series/${series.id}/watch/${first.id}/1`,
				label: "Play",
			}
		);
	});
</script>

<div class="actions">
	{#if play}
		<a class="action" href={play.href} aria-label={play.label}>
			<Icon name="play" />
		</a>
	{/if}

	<Tooltip text={listed ? "Remove from Watchlist" : "Add to Watchlist"}>
		<button
			type="button"
			class="action"
			aria-label={listed ? "Remove from Watchlist" : "Add to Watchlist"}
			aria-pressed={listed}
			onclick={() =>
				setListed({
					seriesId: series.id,
					listed: !listed,
				}).updates(
					listing.withOverride((ids) =>
						listed ? ids.filter((id) => id !== series.id) : [...ids, series.id],
					),
				)}
		>
			<Icon name={listed ? "watchlist-filled" : "watchlist"} />
		</button>
	</Tooltip>

	<Dropdown id="series-actions" label="More" role="menu" aria-label="More">
		{#snippet trigger()}
			<Icon name="more" />
		{/snippet}

		<Button
			role="menuitem"
			popovertarget="series-actions"
			popovertargetaction="hide"
			onclick={() =>
				markAllWatched({
					seriesId: series.id,
					seasonId: season.id,
					watched: !seasonWatched,
				})}
		>
			<Icon name="check" size="sm" />
			{series.seasons.length > 1
				? `Mark ${season.title} as ${seasonWatched ? "unwatched" : "watched"}`
				: `Mark as ${seasonWatched ? "unwatched" : "watched"}`}
		</Button>

		{#if series.seasons.length > 1}
			<Button
				role="menuitem"
				popovertarget="series-actions"
				popovertargetaction="hide"
				onclick={() =>
					markAllWatched({
						seriesId: series.id,
						watched: true,
					})}
			>
				<Icon name="check" size="sm" />
				Mark all as watched
			</Button>
		{/if}

		<Button
			role="menuitem"
			popovertarget="series-actions"
			popovertargetaction="hide"
			onclick={() =>
				setDropped({
					seriesId: series.id,
					dropped: library.status !== "dropped",
				})}
		>
			<Icon name={library.status === "dropped" ? "restore" : "close"} size="sm" />
			{library.status === "dropped" ? "Undo drop" : "Drop"}
		</Button>

		{#if library.last_watched_at}
			<Button
				role="menuitem"
				popovertarget="series-actions"
				popovertargetaction="hide"
				onclick={() => clearProgress(series.id)}
			>
				<Icon name="delete" size="sm" />
				Clear progress
			</Button>
		{/if}

		<a role="menuitem" href="/series/{series.id}/artwork">
			<Icon name="edit" size="sm" />
			Edit artwork
		</a>
	</Dropdown>
</div>

<style>
	.actions {
		display: flex;
		flex: none;
		align-items: center;
		gap: 4px;
	}

	.action,
	.actions :global(.dropdown-trigger) {
		border: none;
		background: none;
		cursor: pointer;
		display: inline-grid;
		place-items: center;
		width: 40px;
		height: 40px;
		padding: 0;
		border-radius: 50%;
		color: #ddd;
		transition:
			background 120ms,
			color 120ms;
	}

	.action:hover,
	.actions :global(.dropdown-trigger:hover),
	.actions:has(:popover-open) :global(.dropdown-trigger) {
		background: rgb(255 255 255 / 0.1);
		color: #fff;
	}

	.action:focus-visible {
		outline: 2px solid #fff;
		outline-offset: 2px;
	}

	.actions :global(.dropdown-menu .button) {
		gap: 12px;
	}

	.actions :global(.dropdown-menu a) {
		display: flex;
		align-items: center;
		gap: 12px;
		color: inherit;
		text-decoration: none;
	}

	.actions :global(.dropdown-menu a:hover),
	.actions :global(.dropdown-menu a:focus-visible) {
		background: rgb(255 255 255 / 0.08);
		color: #fff;
		outline: none;
	}
</style>
