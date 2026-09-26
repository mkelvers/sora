<script lang="ts">
	import Filters from './_components/Filters.svelte';
	import Images from './_components/Images.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Icon from '$lib/components/ui/Icon.svelte';
	import Skeleton from '$lib/components/snippets/Skeleton.svelte';
	import { ArtworkFilters, chooseArtwork } from './artwork.svelte';
	import { getSeries } from '../series.remote';
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
			<a class="icon-button" href="/series/{series.id}" aria-label="Back to {series.title}" title="Back">
				<Icon name="back" />
			</a>

			<div class="heading">
				<h1>Artwork</h1>
				<span>{series.title}</span>
			</div>

			<Button class="icon-button" onclick={reset} aria-label="Use default" title="Use default">
				<Icon name="restore" />
			</Button>
		</div>
	</header>

	<div class="body">
		<aside>
			<section>
				<h2>Type</h2>
				<div class="types" role="radiogroup" aria-label="Type">
					{#each types as option (option.value)}
						<Button
							variant="ghost"
							role="radio"
							aria-checked={filters.type === option.value}
							onclick={() => (filters.type = option.value)}
						>
							{option.label}
						</Button>
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
					<ul class="loading" class:poster={filters.type === 'poster'} aria-busy="true" aria-label="Loading images">
						{#each { length: 12 }, index (index)}
							<li>
								<Skeleton width="100%" ratio={filters.type === 'poster' ? '2 / 3' : '16 / 9'} />
								<Skeleton variant="text" width="50%" />
								<Skeleton variant="text" width="70%" />
							</li>
						{/each}
					</ul>
				{/snippet}

				<Images {series} {filters} />
			</svelte:boundary>
		</main>
	</div>
</div>

<style>
	.page {
		--side: clamp(16px, 3.3vw, 64px);
		min-height: 100vh;
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

	.bar :global(.icon-button) {
		display: inline-grid;
		flex: none;
		place-items: center;
		width: 40px;
		height: 40px;
		border-radius: 50%;
		color: #ddd;
		transition:
			background 120ms,
			color 120ms;
	}

	.bar :global(.icon-button:hover) {
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

	.types > :global(.button) {
		justify-content: flex-start;
		padding: 8px 12px;
		color: #999;
		font-size: 15px;
		text-align: left;
	}

	.types > :global(.button:hover) {
		color: #fff;
	}

	.types > :global([aria-checked='true']) {
		background: rgb(255 255 255 / 0.1);
		color: #fff;
	}

	/* Mirrors the image grid, so nothing shifts when it loads */
	.loading {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
		gap: 28px 16px;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.loading.poster {
		grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
	}

	.loading li {
		display: grid;
		justify-items: center;
		gap: 10px;
	}

	.error {
		margin: 0 0 16px;
		color: #f28b82;
		font-size: 14px;
	}

	a:focus-visible {
		outline: 2px solid #fff;
		outline-offset: 2px;
	}
</style>
