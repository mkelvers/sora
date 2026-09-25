<script lang="ts">
	import { ArtworkFilters } from '$lib/components/artwork/artwork-filters.svelte';
	import Filters from '$lib/components/artwork/Filters.svelte';
	import Images from '$lib/components/artwork/Images.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import { imagesSkeleton } from '$lib/components/snippets/images-skeleton.svelte';
	import { getSeries } from '$lib/remote/anime.remote';
	import type { PageProps } from './$types';

	let { params }: PageProps = $props();

	const series = $derived(await getSeries(params.id));
	const filters = new ArtworkFilters();
</script>

<svelte:head>
	<title>Artwork · {series.title}</title>
</svelte:head>

<div class="page">
	<aside>
		<a class="back" href="/anime/{series.id}">
			<Icon name="back" size="md" />
			{series.title}
		</a>
		<h1>Artwork</h1>

		<svelte:boundary>
			{#snippet pending()}{/snippet}

			<Filters seriesId={series.id} {filters} />
		</svelte:boundary>
	</aside>

	<main>
		<svelte:boundary>
			{#snippet pending()}
				{@render imagesSkeleton(filters.type)}
			{/snippet}

			<Images {series} {filters} />
		</svelte:boundary>
	</main>
</div>

<style>
	:global(body) {
		margin: 0;
		background: #101010;
	}

	.page {
		display: grid;
		grid-template-columns: 240px minmax(0, 1fr);
		gap: 40px;
		min-height: 100vh;
		box-sizing: border-box;
		padding: 32px clamp(16px, 3.3vw, 64px) 64px;
		color: #e6e6e6;
		font-family: system-ui, sans-serif;
	}

	aside {
		position: sticky;
		top: 32px;
		align-self: start;
		display: grid;
		gap: 24px;
	}

	.back {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		color: #999;
		font-size: 14px;
		text-decoration: none;
	}

	.back:hover {
		color: #fff;
	}

	h1 {
		margin: -12px 0 0;
		font-size: 28px;
		font-weight: 400;
	}

	@media (max-width: 860px) {
		.page {
			grid-template-columns: minmax(0, 1fr);
		}

		aside {
			position: static;
		}
	}
</style>
