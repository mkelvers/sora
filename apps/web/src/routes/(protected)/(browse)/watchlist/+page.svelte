<script lang="ts">
	import emptyHistory from "$lib/assets/illustrations/empty-history.webp";
	import emptyWatchlist from "$lib/assets/illustrations/empty-watchlist.webp";
	import EmptyState from "$lib/components/EmptyState.svelte";
	import Skeleton from "$lib/components/snippets/Skeleton.svelte";
	import Tabs from "$lib/components/ui/Tabs.svelte";
	import { BookmarkSimpleIcon } from "phosphor-svelte";

	import HistoryCard from "./_components/HistoryCard.svelte";
	import WatchlistCard from "./_components/WatchlistCard.svelte";
	import { getHistory, getWatchlist } from "./watchlist.remote";

	let tab = $state<"watchlist" | "history">("watchlist");
	const watchlist = getWatchlist();
	const history = getHistory();
</script>

<svelte:head>
	<title>{tab === "history" ? "History" : "Watchlist"} · Sora</title>
</svelte:head>

<main
	class="min-h-[calc(100dvh-6.5rem)] bg-canvas px-[clamp(1rem,3.3vw,4rem)] pt-10 pb-10 text-foreground sm:min-h-[calc(100dvh-3.5rem)]"
>
	<h1 class="flex items-center justify-center gap-3 text-4xl font-semibold">
		<BookmarkSimpleIcon size="2.25rem" />
		My Lists
	</h1>

	<Tabs
		items={[
			{
				value: "watchlist",
				label: "Watchlist",
			},
			{
				value: "history",
				label: "History",
			},
		]}
		bind:value={tab}
		label="Lists"
		class="mx-auto mt-10 mb-8 max-w-7xl justify-center"
	>
		{#snippet children(current)}
			<div class="mx-auto max-w-7xl">
				{#if current === "watchlist" && watchlist.current?.length === 0}
					<EmptyState
						image={emptyWatchlist}
						alt="Sora's mascot carrying a stack of poster cards to an empty box"
						width={720}
						height={700}
						title="Your watchlist is looking a little empty."
						hint="Let's fill it up with something to watch."
					/>
				{:else if current === "watchlist"}
					<ul class="grid grid-cols-1 gap-x-4 gap-y-6 pb-10 min-[30em]:grid-cols-2 lg:grid-cols-4">
						{#if watchlist.current}
							{#each watchlist.current as entry (entry.series.id)}
								<li><WatchlistCard {entry} /></li>
							{/each}
						{:else}
							{#each { length: 8 }, index (index)}
								<li class="p-2"><Skeleton class="aspect-video w-full" /></li>
							{/each}
						{/if}
					</ul>
				{:else if history.current?.length === 0}
					<EmptyState
						image={emptyHistory}
						alt="Sora's mascot on a floor cushion with cheeks full of popcorn"
						width={690}
						height={720}
						title="Nothing watched yet."
						hint="Start an episode and it'll show up here."
					/>
				{:else}
					<ul class="grid grid-cols-1 gap-x-4 gap-y-6 pb-10 min-[30em]:grid-cols-2 lg:grid-cols-4">
						{#if history.current}
							{#each history.current as item (`${item.season_id}:${item.episode}`)}
								<li><HistoryCard {item} /></li>
							{/each}
						{:else}
							{#each { length: 8 }, index (index)}
								<li class="p-2"><Skeleton class="aspect-video w-full" /></li>
							{/each}
						{/if}
					</ul>
				{/if}
			</div>
		{/snippet}
	</Tabs>
</main>
