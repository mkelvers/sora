<script lang="ts">
	import type { ContinueWatchingItem, Series } from "@sora/sdk";
	import Dropdown from "$lib/components/ui/Dropdown.svelte";
	import Icon from "$lib/components/ui/Icon.svelte";

	type Props = {
		series: Series;
		resume: ContinueWatchingItem | null;
	};

	let { series, resume }: Props = $props();

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

	<Dropdown id="series-actions" label="More" role="menu" aria-label="More">
		{#snippet trigger()}
			<Icon name="more" />
		{/snippet}

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
