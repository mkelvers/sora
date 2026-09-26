<script lang="ts">
	import { page } from '$app/state';
	import { searchSeries } from './search.remote';

	const text = $derived(page.url.searchParams.get('q')?.trim() ?? '');
	const search = $derived(text ? searchSeries(text) : undefined);
</script>

<svelte:head>
	<title>{text ? `${text} · Search` : 'Search'}</title>
</svelte:head>

<main>
	{#if text}
		<h1>Results for “{text}”</h1>

		{#if search?.error}
			<p>Search failed. Try again.</p>
		{:else if !search?.current}
			<div class="spinner" role="status" aria-label="Searching"></div>
		{:else if search.current.length}
			<ul>
				{#each search.current as series (series.id)}
					<li>
						<a href="/series/{series.id}">
							{#if series.poster_url}
								<img src={series.poster_url} alt="" loading="lazy" decoding="async" />
							{:else}
								<div class="poster"></div>
							{/if}
							<span class="title">{series.title}</span>
							{#if series.year}
								<span class="year">{series.year}</span>
							{/if}
						</a>
					</li>
				{/each}
			</ul>
		{:else}
			<p>Nothing matched.</p>
		{/if}
	{/if}
</main>

<style>
	main {
		padding: 24px clamp(16px, 3.3vw, 64px) 64px;
	}

	h1 {
		margin: 0 0 24px;
		font-size: 22px;
		font-weight: 400;
	}

	p {
		color: #999;
	}

	.spinner {
		position: fixed;
		inset: 0;
		width: 40px;
		height: 40px;
		margin: auto;
		border: 3px solid rgb(255 255 255 / 0.15);
		border-top-color: #e6e6e6;
		border-radius: 50%;
		animation: spin 800ms linear infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	ul {
		--gap: 24px;
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(max(200px, (100% - 5 * var(--gap)) / 6), 1fr));
		gap: 32px var(--gap);
		margin: 0;
		padding: 0;
		list-style: none;
	}

	a {
		display: flex;
		flex-direction: column;
		gap: 4px;
		color: inherit;
		text-decoration: none;
	}

	img,
	.poster {
		display: block;
		width: 100%;
		aspect-ratio: 2 / 3;
		margin-bottom: 4px;
		object-fit: cover;
		background: #2a2a2a;
		transition: filter 120ms;
	}

	a:hover img {
		filter: brightness(1.15);
	}

	a:focus-visible {
		outline: 2px solid #fff;
		outline-offset: 4px;
	}

	.title {
		font-size: 15px;
	}

	.year {
		color: #999;
		font-size: 13px;
	}
</style>
