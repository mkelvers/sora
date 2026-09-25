<script lang="ts">
	import { ArtworkFilters } from './artwork-filters.svelte';
	import Filters from './_components/Filters.svelte';
	import Images from './_components/Images.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import { imagesSkeleton } from './_components/images-skeleton.svelte';
	import { getSeries } from '../anime.remote';
	import { chooseArtwork } from './choose-artwork';
	import type { PageProps } from './$types';

	let { params }: PageProps = $props();

	const series = $derived(await getSeries(params.id));
	const filters = new ArtworkFilters();

	const types = [
		{
			value: 'poster',
			label: 'Posters'
		},
		{
			value: 'backdrop',
			label: 'Backdrops'
		},
		{
			value: 'logo',
			label: 'Logos'
		}
	] as const;

	let failed = $state(false);

	async function reset() {
		try {
			await chooseArtwork(series.id, filters.type, null);
			failed = false;
		} catch {
			failed = true;
		}
	}
</script>

<svelte:head>
	<title>Artwork · {series.title}</title>
</svelte:head>

<div class="page">
	<header>
		{#if series.backdrop_url}
			<img class="backdrop" src={series.backdrop_url} alt="" />
		{/if}

		<div class="bar">
			<a href="/anime/{series.id}" aria-label="Back to {series.title}" title="Back">
				<Icon name="back" />
			</a>

			<div class="heading">
				<h1>Artwork</h1>
				<span>{series.title}</span>
			</div>

			<button onclick={reset} aria-label="Use default" title="Use default">
				<Icon name="restore" />
			</button>
		</div>
	</header>

	<div class="body">
		<aside>
			<section>
				<h2>Type</h2>
				<div class="types" role="radiogroup" aria-label="Type">
					{#each types as option (option.value)}
						<button role="radio" aria-checked={filters.type === option.value} onclick={() => (filters.type = option.value)}>
							{option.label}
						</button>
					{/each}
				</div>
			</section>

			<svelte:boundary>
				{#snippet pending()}{/snippet}

				<Filters seriesId={series.id} {filters} />
			</svelte:boundary>
		</aside>

		<main>
			{#if failed}
				<p class="error" role="alert">The default couldn’t be restored.</p>
			{/if}

			<svelte:boundary>
				{#snippet pending()}
					{@render imagesSkeleton(filters.type)}
				{/snippet}

				<Images {series} {filters} />
			</svelte:boundary>
		</main>
	</div>
</div>

<style>
	:global(body) {
		margin: 0;
		background: #101010;
	}

	.page {
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
		padding: 16px var(--side);
		background: rgb(40 40 40 / 0.85);
	}

	.heading {
		display: flex;
		flex-direction: column;
		gap: 4px;
		min-width: 0;
		margin-right: auto;
	}

	h1 {
		margin: 0;
		font-size: 28px;
		font-weight: 400;
	}

	.heading span {
		overflow: hidden;
		color: #bbb;
		font-size: 17px;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.bar a,
	.bar button {
		display: inline-grid;
		flex: none;
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

	.bar a:hover,
	.bar button:hover {
		background: rgb(255 255 255 / 0.1);
		color: #fff;
	}

	.body {
		display: grid;
		grid-template-columns: 220px minmax(0, 1fr);
		gap: clamp(24px, 3vw, 56px);
		align-items: start;
		padding: 40px var(--side) 64px;
	}

	aside {
		position: sticky;
		top: 24px;
		display: grid;
		gap: 28px;
	}

	section {
		display: grid;
		gap: 10px;
	}

	h2 {
		margin: 0;
		color: #999;
		font-size: 12px;
		font-weight: 400;
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}

	.types {
		display: grid;
		gap: 2px;
	}

	.types button {
		padding: 8px 12px;
		border: none;
		border-radius: 4px;
		background: none;
		color: #999;
		font: inherit;
		font-size: 15px;
		text-align: left;
		cursor: pointer;
		transition:
			background 120ms,
			color 120ms;
	}

	.types button:hover {
		background: rgb(255 255 255 / 0.06);
		color: #fff;
	}

	.types button[aria-checked='true'] {
		background: rgb(255 255 255 / 0.1);
		color: #fff;
	}

	.error {
		margin: 0 0 16px;
		color: #f28b82;
		font-size: 14px;
	}

	a:focus-visible,
	button:focus-visible {
		outline: 2px solid #fff;
		outline-offset: 2px;
	}

	@media (max-width: 860px) {
		.body {
			grid-template-columns: minmax(0, 1fr);
			padding-top: 24px;
		}

		aside {
			position: static;
		}
	}

	@media (max-width: 720px) {
		header {
			height: 240px;
		}

		.bar {
			min-height: 80px;
			gap: 8px;
		}

		h1 {
			font-size: 20px;
		}

		.heading span {
			font-size: 14px;
		}
	}
</style>
