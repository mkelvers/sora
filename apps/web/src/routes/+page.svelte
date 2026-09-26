<script lang="ts">
	import Hero from './_components/Hero.svelte';
	import Shelf from './_components/Shelf.svelte';
	import Poster from '$lib/components/snippets/Poster.svelte';
	import Skeleton from '$lib/components/snippets/Skeleton.svelte';
	import { getBrowse, getGenres } from './browse/browse.remote';
	import { getSchedule } from './schedule/schedule.remote';
	import { animeSeason, formatAnimeSeason, formatDay, formatTime } from '$lib/utils';
	import type { SeriesCard } from '@sora/sdk';

	const now = animeSeason(new Date());
	const next = animeSeason(new Date(), 1);

	const trending = getBrowse({ sort: 'trending', per_page: 20 });
	const simulcast = getBrowse({ season: now.season, season_year: now.year, sort: 'popular', per_page: 20 });
	const fresh = getBrowse({ status: 'RELEASING', sort: 'newest', per_page: 20 });
	const popular = getBrowse({ sort: 'popular', per_page: 20 });
	const upcoming = getBrowse({
		season: next.season,
		season_year: next.year,
		status: 'NOT_YET_RELEASED',
		sort: 'popular',
		per_page: 20
	});
	const rated = getBrowse({ sort: 'score', per_page: 20 });
	const schedule = getSchedule();
	const genres = getGenres();

	const shelves = [
		{
			title: 'Simulcast',
			subtitle: formatAnimeSeason(now.season, now.year),
			href: `/browse?season=${now.season}&season_year=${now.year}&sort=popular`,
			query: simulcast
		},
		{
			title: 'New',
			subtitle: 'Recently started airing',
			href: '/browse?status=RELEASING&sort=newest',
			query: fresh
		},
		{
			title: 'Most popular',
			href: '/browse?sort=popular',
			query: popular
		},
		{
			title: 'Coming next season',
			subtitle: formatAnimeSeason(next.season, next.year),
			href: `/browse?season=${next.season}&season_year=${next.year}&status=NOT_YET_RELEASED&sort=popular`,
			query: upcoming
		},
		{
			title: 'Top rated',
			href: '/browse?sort=score',
			query: rated
		}
	];

	const byId = (series: SeriesCard) => series.id;
</script>

<svelte:head>
	<title>Sora</title>
</svelte:head>

<Hero series={trending.current?.results} />

<main>
	<Shelf title="Trending now" href="/browse?sort=trending" items={trending.current?.results} key={byId}>
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

	{#each shelves as shelf (shelf.title)}
		<Shelf
			title={shelf.title}
			subtitle={shelf.subtitle}
			href={shelf.href}
			items={shelf.query.current?.results}
			key={byId}
		>
			{#snippet item(series)}
				<Poster {series} />
			{/snippet}
		</Shelf>
	{/each}

	<section class="genres">
		<h2>Genres</h2>
		<ul>
			{#if genres.current}
				{#each genres.current as genre (genre)}
					<li>
						<a href="/browse?genre={encodeURIComponent(genre)}&sort=popular">{genre}</a>
					</li>
				{/each}
			{:else}
				{#each { length: 12 }, index (index)}
					<li><Skeleton height="56px" /></li>
				{/each}
			{/if}
		</ul>
	</section>
</main>

<style>
	main {
		display: flex;
		flex-direction: column;
		gap: 48px;
		padding: 24px 0 64px;
	}

	.genres {
		padding: 0 clamp(16px, 3.3vw, 64px);
	}

	h2 {
		margin: 0 0 12px;
		font-size: 21px;
		font-weight: 400;
	}

	ul {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
		gap: 8px;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.genres a {
		display: flex;
		align-items: center;
		height: 56px;
		padding: 0 16px;
		background: rgb(255 255 255 / 0.06);
		color: #ddd;
		font-size: 15px;
		text-decoration: none;
		transition:
			background 120ms,
			color 120ms;
	}

	.genres a:hover {
		background: rgb(255 255 255 / 0.12);
		color: #fff;
	}

	.genres a:focus-visible {
		outline: 2px solid #fff;
		outline-offset: 2px;
	}
</style>
