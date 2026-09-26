<script lang="ts">
	import Skeleton from '$lib/components/snippets/Skeleton.svelte';
	import { getGenres } from '../browse/browse.remote';

	const genres = getGenres();
</script>

<svelte:head>
	<title>Genres</title>
</svelte:head>

<main>
	<h1>Genres</h1>

	{#if genres.error}
		<p>Couldn't load genres. Try again.</p>
	{:else}
		<ul>
			{#if genres.current}
				{#each genres.current as genre (genre)}
					<li>
						<a href="/browse?genre={encodeURIComponent(genre)}&sort=popular">{genre}</a>
					</li>
				{/each}
			{:else}
				{#each { length: 18 }, index (index)}
					<li><Skeleton height="64px" /></li>
				{/each}
			{/if}
		</ul>
	{/if}
</main>

<style>
	main {
		padding: 32px clamp(16px, 3vw, 48px) 64px;
	}

	h1 {
		margin: 0 0 24px;
		font-size: 28px;
		font-weight: 400;
	}

	p {
		color: #999;
	}

	ul {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
		gap: 8px;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	a {
		display: flex;
		align-items: center;
		height: 64px;
		padding: 0 20px;
		background: rgb(255 255 255 / 0.06);
		color: #ddd;
		font-size: 15px;
		text-decoration: none;
		transition:
			background 120ms,
			color 120ms;
	}

	a:hover {
		background: rgb(255 255 255 / 0.12);
		color: #fff;
	}

	a:focus-visible {
		outline: 2px solid #fff;
		outline-offset: 2px;
	}
</style>
