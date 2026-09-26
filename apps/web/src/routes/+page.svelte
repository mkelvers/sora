<script lang="ts">
	import Shelf from './_components/Shelf.svelte';
	import Poster from '$lib/components/snippets/Poster.svelte';
	import { getBrowse } from './browse/browse.remote';
	import { getSchedule } from './schedule/schedule.remote';
	import { animeSeason, formatDay, formatTime } from '$lib/utils';
	import type { SeriesCard } from '@sora/sdk';

	const season = animeSeason(new Date());

	const trending = getBrowse({ sort: 'trending', per_page: 20 });
	const simulcast = getBrowse({ season: season.season, season_year: season.year, sort: 'popular', per_page: 20 });
	const popular = getBrowse({ sort: 'popular', per_page: 20 });
	const schedule = getSchedule();

	const byId = (series: SeriesCard) => series.id;
</script>

<svelte:head>
	<title>Sora</title>
</svelte:head>

<main>
	<Shelf title="Trending now" href="/browse?sort=trending" items={trending.current?.results} key={byId}>
		{#snippet item(series)}
			<Poster {series} />
		{/snippet}
	</Shelf>

	<Shelf
		title="Simulcast"
		href="/browse?season={season.season}&season_year={season.year}&sort=popular"
		items={simulcast.current?.results}
		key={byId}
	>
		{#snippet item(series)}
			<Poster {series} />
		{/snippet}
	</Shelf>

	<Shelf
		title="Airing soon"
		href="/schedule"
		items={schedule.current}
		key={(entry) => `${entry.season_id}/${entry.episode}`}
	>
		{#snippet item(entry)}
			<Poster series={entry.series}>
				{#snippet caption()}
					{formatDay(new Date(entry.airing_at))}
					{formatTime(new Date(entry.airing_at))} · Ep {entry.episode}
				{/snippet}
			</Poster>
		{/snippet}
	</Shelf>

	<Shelf title="Popular" href="/browse?sort=popular" items={popular.current?.results} key={byId}>
		{#snippet item(series)}
			<Poster {series} />
		{/snippet}
	</Shelf>
</main>

<style>
	main {
		display: flex;
		flex-direction: column;
		gap: 40px;
		padding: 24px 0 64px;
	}
</style>
