<script lang="ts">
	import { page } from '$app/state';
	import Episodes from './_components/Episodes.svelte';
	import SeasonTabs from './_components/SeasonTabs.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import { episodesSkeleton } from './_components/episodes-skeleton.svelte';
	import { getSeries } from './anime.remote';
    import type { PageProps } from './$types';

	let { params }: PageProps = $props();

	const series = $derived(await getSeries(params.id));
	let season = $derived(series.seasons[0]);
</script>

<svelte:head>
	<title>{series.title}</title>
</svelte:head>

<div class="page">
	<header>
		{#if series.backdrop_url}
			<img class="backdrop" src={series.backdrop_url} alt={series.title} />
		{/if}

		<div class="bar">
			<div class="heading">
				<h1>{series.title}</h1>
				<span>{season.title}</span>
			</div>

			<a href="/anime/{series.id}/artwork" aria-label="Edit artwork" title="Edit artwork">
				<Icon name="edit" />
			</a>
		</div>
	</header>

	<div class="body">
		{#if series.poster_url}
			<img class="poster" src={series.poster_url} alt="" />
		{:else}
			<div class="poster"></div>
		{/if}

		<section>
			{#if series.seasons.length > 1}
				<SeasonTabs seasons={series.seasons} bind:season />
			{/if}

			<svelte:boundary>
				{#snippet pending()}
					{@render episodesSkeleton(season.episode_count)}
				{/snippet}

				<Episodes seriesId={series.id} {season} />
			</svelte:boundary>
		</section>
	</div>
</div>

<style>
	:global(body) {
		margin: 0;
	}

	.page {
		--poster: clamp(120px, 25vw, 480px);
		--gap: clamp(16px, 4vw, 80px);
		--side: clamp(16px, 3.3vw, 64px);
		min-height: 100vh;
		background: #101010;
		color: #e6e6e6;
		font-family: system-ui, sans-serif;
	}

	header {
		position: relative;
		height: 432px;
		background: #1c1c1c;
	}

	.backdrop {
		display: block;
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.bar {
		position: absolute;
		inset: auto 0 0;
		display: flex;
		align-items: center;
		gap: 16px;
		box-sizing: border-box;
		min-height: 108px;
		padding: 16px var(--side) 16px calc(var(--side) + var(--poster) + var(--gap));
		background: rgb(40 40 40 / 0.85);
	}

	.heading {
		display: flex;
		flex-direction: column;
		gap: 4px;
		margin-right: auto;
	}

	h1 {
		margin: 0;
		font-size: 28px;
		font-weight: 400;
	}

	.heading span {
		color: #bbb;
		font-size: 17px;
	}

	.bar a {
		display: inline-grid;
		place-items: center;
		width: 40px;
		height: 40px;
		padding: 0;
		border: none;
		border-radius: 50%;
		background: none;
		color: #ddd;
		cursor: pointer;
		transition:
			background 120ms,
			color 120ms;
	}

	.bar a:hover {
		background: rgb(255 255 255 / 0.1);
		color: #fff;
	}

	.bar a:focus-visible {
		outline: 2px solid #fff;
		outline-offset: 2px;
	}

	.body {
		display: grid;
		grid-template-columns: var(--poster) 1fr;
		gap: var(--gap);
		align-items: start;
		padding: 0 var(--side) 64px;
	}

	.poster {
		display: block;
		position: relative;
		width: 100%;
		aspect-ratio: 2 / 3;
		object-fit: cover;
		margin-top: -192px;
		background: #2a2a2a;
	}

	section {
		min-width: 0;
		padding-top: 40px;
	}

	@media (max-width: 720px) {
		header {
			height: 240px;
		}

		.bar {
			min-height: 80px;
		}

		h1 {
			font-size: 20px;
		}

		.heading span {
			font-size: 14px;
		}

		.poster {
			margin-top: -120px;
		}

		section {
			grid-column: 1 / -1;
			padding-top: 0;
		}

	}
</style>
