<script lang="ts">
	import Button from '$lib/components/ui/Button.svelte';
	import Posters from '$lib/components/snippets/Posters.svelte';
	import { getBrowse, type Filters } from '../browse.remote';
	import type { SeriesCard } from '@sora/sdk';

	type Props = {
		filters: Filters;
	};

	let { filters }: Props = $props();

	let pages = $state(1);

	const queries = $derived(Array.from({ length: pages }, (_, index) => getBrowse({ ...filters, page: index + 1, per_page: 30 })));

	/** The pages loaded so far, in order, stopping at the first still loading. */
	const loaded = $derived.by(() => {
		const done = [];
		for (const query of queries) {
			if (!query.current) break;
			done.push(query.current);
		}
		return done;
	});

	// A title can reach two pages when its AniList entries rank apart.
	const series = $derived.by(() => {
		if (!loaded.length) return undefined;
		const unique = new Map<string, SeriesCard>();
		for (const item of loaded.flatMap((page) => page.results)) {
			unique.set(item.id, unique.get(item.id) ?? item);
		}
		return [...unique.values()];
	});

	const last = $derived(loaded.at(-1));
	const loading = $derived(loaded.length > 0 && loaded.length < pages);
</script>

{#if queries[0].error}
	<p>Couldn't load titles. Try again.</p>
{:else if series?.length === 0}
	<p>
		Nothing here yet.
		{#if last?.meta.preparing}Titles are still being prepared; check back shortly.{/if}
	</p>
{:else}
	<Posters {series} />

	{#if loading}
		<div class="spinner" role="status" aria-label="Loading more"></div>
	{:else if last?.meta.has_next_page}
		<div class="actions">
			<Button onclick={() => (pages += 1)}>Show more</Button>
		</div>
	{/if}
{/if}

<style>
	p {
		color: #999;
	}

	.spinner {
		width: 32px;
		height: 32px;
		margin: 40px auto 0;
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

	.actions {
		display: flex;
		justify-content: center;
		margin-top: 40px;
	}

	.actions :global(.button) {
		padding: 10px 24px;
		background: rgb(255 255 255 / 0.1);
		font-size: 15px;
	}

	.actions :global(.button:hover) {
		background: rgb(255 255 255 / 0.16);
	}
</style>
