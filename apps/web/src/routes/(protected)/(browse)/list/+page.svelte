<script lang="ts">
	import { page } from '$app/state';
	import type { WatchlistItem } from '@sora/sdk';
	import Poster from '$lib/components/Poster.svelte';
	import { cn } from '$lib/utils';
	import { getListed } from '$lib/watchlist.remote';
	import { getWatchlist } from './list.remote';

	const statuses = [
		{
			value: undefined,
			label: 'All',
		},
		{
			value: 'watching',
			label: 'Watching',
		},
		{
			value: 'planning',
			label: 'Plan to Watch',
		},
		{
			value: 'completed',
			label: 'Completed',
		},
		{
			value: 'dropped',
			label: 'Dropped',
		},
	] as const;

	const status = $derived(statuses.find((option) => option.value === page.url.searchParams.get('status'))?.value);
	const list = $derived(await getWatchlist(status));
	const listing = getListed();
	const items = $derived(list.items.filter((item) => listing.current?.includes(item.series.id) ?? true));
	const total = $derived(Object.values(list.counts).reduce((sum, count) => sum + count, 0));

	$effect(() => {
		if (list.preparing === 0) {
			return;
		}

		const timer = setTimeout(() => getWatchlist(status).refresh(), 5000);

		return () => clearTimeout(timer);
	});

	function describe(item: WatchlistItem) {
		const current = item.current_season;
		if (item.status === 'watching' && current) {
			return `${item.series.season_count > 1 ? `${current.title} · ` : ''}${current.watched_episodes}/${current.released_episodes} episodes`;
		}

		if (item.status === 'completed') {
			return item.new_season ? `Watched · ${item.new_season.title} is out` : 'Watched';
		}

		return item.status === 'dropped' ? 'Dropped' : 'Not started';
	}
</script>

<svelte:head>
	<title>Watchlist · Sora</title>
</svelte:head>

<main class="min-h-[calc(100dvh-3.5rem)] bg-canvas text-foreground">
	<div class="mx-auto w-full max-w-384 px-5 py-9 sm:px-10 sm:py-11 lg:px-16 lg:py-14">
		<div class="flex flex-wrap items-baseline justify-between gap-4">
			<nav class="flex gap-6" aria-label="Library">
				<a href="/list" class="text-2xl font-semibold" aria-current="page">Watchlist</a>
				<a href="/list/history" class="text-2xl font-semibold text-subtle transition-colors hover:text-foreground">History</a>
			</nav>
			<a
				href="/list/import"
				class="text-xs font-bold text-accent uppercase transition-[filter] hover:brightness-125"
			>
				Import from AniList
			</a>
		</div>

		<nav class="scrollbar-hidden mt-8 overflow-x-auto border-b border-border sm:mt-10" aria-label="Status">
			<ul class="-mb-px flex min-w-max gap-5 sm:gap-7">
				{#each statuses as option (option.label)}
					<li>
						<a
							href={option.value ? `/list?status=${option.value}` : '/list'}
							aria-current={option.value === status ? 'page' : undefined}
							class={cn(
								'inline-flex h-12 items-center gap-2 border-b-2 text-sm font-medium transition-colors hover:text-foreground',
								option.value === status ? 'border-accent text-foreground' : 'border-transparent text-muted'
							)}
						>
							{option.label}
							<span class="text-xs text-subtle tabular-nums">{option.value ? list.counts[option.value] : total}</span>
						</a>
					</li>
				{/each}
			</ul>
		</nav>

		{#if list.preparing > 0}
			<p class="mt-6 text-sm text-muted">
				{list.preparing}
				{list.preparing === 1 ? 'imported title is' : 'imported titles are'} still being prepared. They’ll appear here as they’re ready.
			</p>
		{/if}

		{#if items.length}
			<section class="mt-8" aria-label="Titles">
				<div class="grid grid-cols-2 gap-x-3 gap-y-8 sm:grid-cols-3 sm:gap-x-4 md:grid-cols-4 lg:grid-cols-5 lg:gap-x-7.5 lg:gap-y-12 xl:grid-cols-6 2xl:grid-cols-7">
					{#each items as item (item.series.id)}
						{@const current = item.current_season}
						<div>
							<Poster card={item.series} meta={describe(item)} />
							{#if item.status === 'watching' && current && current.released_episodes > 0}
								<div class="mt-2 h-1 bg-surface">
									<div class="h-full bg-accent" style:width="{(current.watched_episodes / current.released_episodes) * 100}%"></div>
								</div>
							{/if}
						</div>
					{/each}
				</div>
			</section>
		{:else}
			<section class="mt-8 grid min-h-112 place-items-center border border-dashed border-border px-6 py-12 text-center">
				<div class="flex max-w-md flex-col items-center gap-5">
					<h2 class="text-xl font-bold sm:text-2xl">{total === 0 ? 'Your watchlist is empty' : 'Nothing here'}</h2>
					<p class="text-sm leading-6 text-muted sm:text-base">
						{total === 0
							? 'Add titles with the bookmark on any poster, or bring over your list from AniList.'
							: 'No titles on your watchlist have this status.'}
					</p>
					<a
						href={total === 0 ? '/list/import' : '/list'}
						class="inline-flex min-h-11 items-center bg-accent px-5 text-xs font-bold text-on-accent uppercase transition-[filter,transform] duration-150 hover:brightness-110 active:scale-[0.97]"
					>
						{total === 0 ? 'Import from AniList' : 'View all'}
					</a>
				</div>
			</section>
		{/if}
	</div>
</main>
