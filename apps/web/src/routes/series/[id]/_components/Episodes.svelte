<script lang="ts">
	import Episode from './Episode.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Dropdown from '$lib/components/ui/Dropdown.svelte';
	import Icon from '$lib/components/ui/Icon.svelte';
	import Skeleton from '$lib/components/snippets/Skeleton.svelte';
	import { getEpisodes } from '../series.remote';
	import type { EpisodeProgress, Season, Series } from '@sora/sdk';

	type Props = {
		series: Series;
		season: Season;
		/** The profile's saved positions, once loaded. */
		progress: EpisodeProgress[] | undefined;
	};

	let { series, season = $bindable(), progress }: Props = $props();

	const episodes = $derived(getEpisodes({ seriesId: series.id, seasonId: season.id }));
	let newest = $state(false);

	const ordered = $derived(newest ? [...(episodes.current ?? [])].reverse() : episodes.current);
	const saved = $derived(
		new Map(
			(progress ?? [])
				.filter((checkpoint) => checkpoint.season_id === season.id)
				.map((checkpoint) => [checkpoint.episode, checkpoint])
		)
	);
</script>

<section>
	<div class="top">
		{#if series.seasons.length > 1}
			<Dropdown id="season-menu" class="season-menu" alignment="left" label="Season" role="menu">
				{#snippet trigger()}
					<span class="current">{season.title}</span>
					<Icon name="expand" size="md" />
				{/snippet}

				{#each series.seasons as other (other.id)}
					<Button
						role="menuitemradio"
						aria-checked={other.id === season.id}
						popovertarget="season-menu"
						popovertargetaction="hide"
						onclick={() => (season = other)}
					>
						<span class="name">{other.title}</span>
						<span class="count">{other.episode_count} {other.episode_count === 1 ? 'episode' : 'episodes'}</span>
					</Button>
				{/each}
			</Dropdown>
		{:else}
			<h2>{season.kind === 'movie' ? 'Movie' : 'Episodes'}</h2>
		{/if}

		{#if season.episode_count > 1}
			<Button class="sort" onclick={() => (newest = !newest)} aria-label="Sort, {newest ? 'newest' : 'oldest'} first">
				<Icon name="sort" size="md" />
				{newest ? 'Newest' : 'Oldest'}
			</Button>
		{/if}
	</div>

	{#if ordered}
		<ol>
			{#each ordered as episode (episode.number)}
				<Episode seriesId={series.id} {season} {episode} progress={saved.get(episode.number)} />
			{:else}
				<li class="empty">No episodes yet.</li>
			{/each}
		</ol>
	{:else}
		<ol aria-busy="true" aria-label="Loading episodes">
			{#each { length: Math.min(season.episode_count || 6, 12) }, index (index)}
				<li>
					<Skeleton ratio="16 / 9" />
					<Skeleton variant="text" width="80%" style="margin-top: 14px" />
					<Skeleton variant="text" width="30%" style="margin-top: 10px" />
				</li>
			{/each}
		</ol>
	{/if}
</section>

<style>
	section {
		padding: 0 var(--gutter);
	}

	.top {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 16px;
		margin-bottom: 20px;
		padding-bottom: 16px;
		border-bottom: 1px solid var(--line);
	}

	h2 {
		margin: 0;
		font-size: 20px;
		font-weight: 650;
		letter-spacing: -0.015em;
	}

	.top :global(.dropdown-trigger) {
		gap: 6px;
		margin-left: -12px;
		padding: 8px 8px 8px 12px;
		border-radius: 8px;
		color: var(--text);
	}

	.current {
		font-size: 20px;
		font-weight: 650;
		letter-spacing: -0.015em;
	}

	.top :global(.season-menu) {
		min-width: 260px;
		max-height: min(420px, 60vh);
		margin-top: 8px;
		padding: 6px;
		overflow-y: auto;
		border: 1px solid var(--line);
		border-radius: 12px;
		background: rgb(27 27 31 / 0.94);
		backdrop-filter: blur(20px);
	}

	.top :global(.season-menu > .button) {
		display: flex;
		justify-content: space-between;
		gap: 24px;
		padding: 10px 12px;
		border-radius: 8px;
		color: var(--text-2);
	}

	.top :global(.season-menu > .button:hover),
	.top :global(.season-menu > .button:focus-visible) {
		background: rgb(255 255 255 / 0.06);
		color: var(--text);
	}

	.top :global(.season-menu > .button[aria-checked='true']) {
		color: var(--text);
		font-weight: 600;
	}

	.count {
		color: var(--text-3);
		font-size: 13px;
		font-weight: 400;
	}

	.top :global(.sort) {
		gap: 6px;
		padding: 8px 12px;
		border-radius: 8px;
		color: var(--text-2);
		font-size: 13px;
		font-weight: 600;
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}

	.top :global(.sort:hover) {
		background: rgb(255 255 255 / 0.06);
		color: var(--text);
	}

	ol {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(min(100%, 264px), 1fr));
		gap: 36px 16px;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.empty {
		color: var(--text-3);
	}
</style>
