<script lang="ts">
	import { page } from '$app/state';
	import Filters from '$lib/components/artwork/Filters.svelte';
	import Images from '$lib/components/artwork/Images.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import { imagesSkeleton } from '$lib/components/snippets/images-skeleton.svelte';
	import { getSeries } from '$lib/remote/anime.remote';
	import type { SeriesImage } from '@sora/sdk';

	const series = $derived(await getSeries(page.params.id));

	let type = $state<SeriesImage['type']>('poster');
	let sort = $state<'votes' | 'quality'>('votes');
</script>

<svelte:head>
	<title>Artwork · {series.title}</title>
</svelte:head>

<div class="page">
	<aside>
		<a class="back" href="/anime/{series.id}">
			<Icon name="back" size={20} />
			{series.title}
		</a>
		<h1>Artwork</h1>
		<Filters bind:type bind:sort />
	</aside>

	<main>
		{#key type}
			<svelte:boundary>
				{#snippet pending()}
					{@render imagesSkeleton(type)}
				{/snippet}

				<Images {series} {type} {sort} />
			</svelte:boundary>
		{/key}
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
