<script lang="ts">
	import EmptyState from "$lib/components/EmptyState.svelte";
	import Tabs from "$lib/components/ui/Tabs.svelte";
	import { mascots } from "$lib/mascots";
	import Poster from "$routes/(app)/components/Poster.svelte";
	import { statuses } from "$routes/(app)/library.svelte";
	import type { WatchlistStatus } from "@sora/sdk";

	import WatchlistSort, { sorts } from "./components/WatchlistSort.svelte";
	import { getWatchlist } from "./watchlist.remote";

	const watchlist = getWatchlist();

	let status = $state<WatchlistStatus | "all">("all");
	let sort = $state(sorts[0]);

	const shown = $derived(
		(watchlist.current ?? [])
			.filter((entry) => status === "all" || entry.status === status)
			.toSorted(sort.compare),
	);
</script>

<svelte:head>
	<title>Watchlist · Sora</title>
</svelte:head>

<div class="page">
	<div class="mx-auto max-w-7xl">
		<h1 class="mb-8 text-2xl font-bold">Watchlist</h1>

		{#if watchlist.current?.length === 0}
			<EmptyState
				mascot={mascots.emptyWatchlist}
				title="Your Watchlist is looking a little empty."
				hint="Let's fill it up with something to watch."
			/>
		{:else}
			<Tabs
				items={[{ value: "all", label: "All" }, ...statuses]}
				bind:value={status}
				label="Statuses"
			>
				{#snippet actions()}
					<div class="ml-auto">
						<WatchlistSort bind:sort />
					</div>
				{/snippet}

				{#snippet children(current)}
					{@const empty = statuses.find((option) => option.value === current)?.empty}
					{#if empty && watchlist.current && shown.length === 0}
						<div class="pt-6 pb-10">
							<EmptyState mascot={mascots.emptySearch} title={empty.title} hint={empty.hint} />
						</div>
					{:else}
						<ul
							class="grid grid-cols-2 items-start gap-x-3 gap-y-8 pt-6 pb-10 **:data-listed:hidden sm:grid-cols-3 sm:gap-x-4 md:grid-cols-4 lg:grid-cols-5 lg:gap-x-7.5 lg:gap-y-12 xl:grid-cols-6"
						>
							{#if watchlist.current}
								{#each shown as entry (entry.series.id)}
									<li class="[&_a>h3]:line-clamp-none [&_h3]:min-h-0">
										<Poster card={entry.series} />
									</li>
								{/each}
							{:else}
								{#each { length: 12 }, index (index)}
									<li>
										<Poster />
									</li>
								{/each}
							{/if}
						</ul>
					{/if}
				{/snippet}
			</Tabs>
		{/if}
	</div>
</div>
