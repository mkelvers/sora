<script lang="ts">
	import { page } from '$app/state';
	import Results from './_components/Results.svelte';
	import type { Filters } from './browse.remote';
	import { animeSeason, formatAnimeSeason } from '$lib/utils';

	const sorts = [
		{ value: 'trending', label: 'Trending' },
		{ value: 'popular', label: 'Popular' },
		{ value: 'newest', label: 'Newest' },
		{ value: 'score', label: 'Top rated' }
	] as const;

	// Taken from the URL as given; the server rejects values it doesn't know.
	const filters = $derived.by((): Filters => {
		const params = page.url.searchParams;
		const genre = params.get('genre');
		return {
			sort: (params.get('sort') ?? undefined) as Filters['sort'],
			season: (params.get('season') ?? undefined) as Filters['season'],
			season_year: params.has('season_year') ? Number(params.get('season_year')) : undefined,
			status: (params.get('status') ?? undefined) as Filters['status'],
			genres: genre ? [genre] : undefined
		};
	});

	const heading = $derived.by(() => {
		const { sort, season, season_year, status, genres } = filters;
		if (genres?.length) {
			return { eyebrow: 'Genre', title: genres.join(', ') };
		}
		if (season && season_year) {
			const current = animeSeason(new Date());
			const eyebrow =
				status === 'NOT_YET_RELEASED'
					? 'Coming soon'
					: current.season === season && current.year === season_year
						? 'Simulcast'
						: 'Season';
			return { eyebrow, title: formatAnimeSeason(season, season_year) };
		}
		if (status === 'RELEASING' && sort === 'newest') {
			return { eyebrow: 'Airing now', title: 'New' };
		}
		const label = sorts.find((option) => option.value === (sort ?? 'trending'))?.label;
		return { eyebrow: 'Browse', title: label ?? 'All titles' };
	});

	function withSort(sort: string) {
		const url = new URL(page.url);
		url.searchParams.set('sort', sort);
		return `${url.pathname}${url.search}`;
	}
</script>

<svelte:head>
	<title>{heading.title} · Browse</title>
</svelte:head>

<main>
	<div class="top">
		<hgroup>
			<p>{heading.eyebrow}</p>
			<h1>{heading.title}</h1>
		</hgroup>

		<nav aria-label="Sort">
			{#each sorts as option (option.value)}
				<a
					href={withSort(option.value)}
					aria-current={(filters.sort ?? 'trending') === option.value ? 'page' : undefined}
					data-sveltekit-noscroll
					data-sveltekit-replacestate
				>
					{option.label}
				</a>
			{/each}
		</nav>
	</div>

	{#key JSON.stringify(filters)}
		<Results {filters} />
	{/key}
</main>

<style>
	main {
		padding: 32px clamp(16px, 3.3vw, 64px) 64px;
	}

	.top {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-end;
		justify-content: space-between;
		gap: 16px 32px;
		margin-bottom: 32px;
	}

	hgroup p {
		margin: 0 0 4px;
		color: #999;
		font-size: 13px;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	h1 {
		margin: 0;
		font-size: 32px;
		font-weight: 400;
	}

	nav {
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
	}

	nav a {
		padding: 8px 14px;
		color: #aaa;
		font-size: 14px;
		text-decoration: none;
		transition:
			background 120ms,
			color 120ms;
	}

	nav a:hover {
		background: rgb(255 255 255 / 0.08);
		color: #fff;
	}

	nav a[aria-current='page'] {
		background: rgb(255 255 255 / 0.14);
		color: #fff;
	}

	nav a:focus-visible {
		outline: 2px solid #fff;
		outline-offset: 2px;
	}
</style>
