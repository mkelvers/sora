<script lang="ts">
	import EmptyState from "$lib/components/EmptyState.svelte";
	import Tabs from "$lib/components/ui/Tabs.svelte";
	import { mascots } from "$lib/mascots";
	import Poster from "$routes/(app)/components/Poster.svelte";
	import type { WatchlistEntry, WatchlistStatus } from "@sora/sdk";
	import { BookmarkSimpleIcon } from "phosphor-svelte";

	import WatchlistSort, { type WatchlistSort as Sort } from "./components/WatchlistSort.svelte";
	import { statusLabels } from "./watchlist";
	import { getWatchlist } from "./watchlist.remote";

	const watchlist = getWatchlist();

	let status = $state<WatchlistStatus | "all">("all");
	let sort = $state<Sort>("updated");

	const tabs = [
		{
			value: "all" as const,
			label: "All",
		},
		...(Object.entries(statusLabels) as [WatchlistStatus, string][]).map(([value, label]) => ({
			value,
			label,
		})),
	];

	const empty: Record<
		WatchlistStatus,
		{
			title: string;
			hint: string;
		}
	> = {
		watching: {
			title: "Nothing on the go right now.",
			hint: "Finish an episode of a title on your watchlist and it lands here.",
		},
		plan_to_watch: {
			title: "Nothing planned to watch.",
			hint: "Add a few titles you've been meaning to start.",
		},
		completed: {
			title: "Nothing finished yet.",
			hint: "Titles you watch to the end land here.",
		},
		dropped: {
			title: "Nothing dropped. Everything's still in the running.",
			hint: "Titles you give up on land here, out of your way.",
		},
	};

	const compare: Record<Sort, ((left: WatchlistEntry, right: WatchlistEntry) => number) | null> = {
		updated: null,
		added: (left, right) => right.added_at.localeCompare(left.added_at),
		title: (left, right) => left.series.title.localeCompare(right.series.title),
	};

	const shown = $derived.by(() => {
		const entries = (watchlist.current ?? []).filter(
			(entry) => status === "all" || entry.status === status,
		);
		const order = compare[sort];
		return order ? entries.toSorted(order) : entries;
	});
</script>

<svelte:head>
	<title>Watchlist · Sora</title>
</svelte:head>

<div class="min-h-page bg-canvas px-[clamp(1rem,3.3vw,4rem)] pt-10 pb-10 text-foreground">
	<h1 class="flex items-center justify-center gap-3 text-4xl font-semibold">
		<BookmarkSimpleIcon size="2.25rem" />
		Watchlist
	</h1>

	<div class="mx-auto mt-10 max-w-7xl">
		{#if watchlist.current?.length === 0}
			<EmptyState
				mascot={mascots.emptyWatchlist}
				title="Your watchlist is looking a little empty."
				hint="Let's fill it up with something to watch."
			/>
		{:else}
			<Tabs items={tabs} bind:value={status} label="Statuses">
				{#snippet actions()}
					<div class="ml-auto">
						<WatchlistSort bind:sort />
					</div>
				{/snippet}

				{#snippet children(current)}
					{#if current !== "all" && watchlist.current && shown.length === 0}
						<EmptyState
							mascot={mascots.emptySearch}
							title={empty[current].title}
							hint={empty[current].hint}
						/>
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
