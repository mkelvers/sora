<script lang="ts">
	import { page } from '$app/state';
	import Posters from '$lib/components/snippets/Posters.svelte';
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
			<Posters series={search.current} />
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
</style>
