<script lang="ts">
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<svelte:head>
	<title>Search</title>
</svelte:head>

<main>
	<form method="GET">
		<input type="search" name="q" value={data.query} placeholder="Search" aria-label="Search" />
	</form>

	{#if data.query && data.results.length === 0}
		<p>No results for “{data.query}”.</p>
	{/if}

	<ul>
		{#each data.results as series (series.id)}
			<li>
				<a href="/anime/{series.id}">
					{#if series.poster_url}
						<img src={series.poster_url} alt="" loading="lazy" />
					{:else}
						<div class="placeholder"></div>
					{/if}
					<span>{series.title}</span>
				</a>
			</li>
		{/each}
	</ul>
</main>

<style>
	main {
		max-width: 1400px;
		margin: 0 auto;
		padding: 12vh 16px 48px;
		font-family: system-ui, sans-serif;
	}

	input {
		display: block;
		width: 100%;
		max-width: 480px;
		margin: 0 auto 40px;
		padding: 10px 14px;
		font: inherit;
		border: 1px solid #ccc;
		border-radius: 0;
		appearance: none;
		outline: none;
	}

	input:focus {
		border-color: #888;
	}

	p {
		text-align: center;
		color: #777;
	}

	a {
		color: inherit;
		text-decoration: none;
	}

	ul {
		display: grid;
		grid-template-columns: repeat(6, 1fr);
		gap: 24px;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	@media (max-width: 720px) {
		ul {
			grid-template-columns: repeat(3, 1fr);
		}
	}

	img,
	.placeholder {
		display: block;
		width: 100%;
		aspect-ratio: 2 / 3;
		object-fit: cover;
		border-radius: 6px;
		background: #eee;
	}

	span {
		display: block;
		margin-top: 6px;
		font-size: 14px;
		line-height: 1.3;
	}
</style>
