<script lang="ts">
	import EmptyState from "$lib/components/EmptyState.svelte";
	import Skeleton from "$lib/components/snippets/Skeleton.svelte";
	import Button from "$lib/components/ui/Button.svelte";
	import Sheet from "$lib/components/ui/Sheet.svelte";
	import Tabs from "$lib/components/ui/Tabs.svelte";
	import { mascots } from "$lib/mascots";
	import Poster from "$routes/(app)/components/Poster.svelte";
	import { statuses } from "$routes/(app)/library.svelte";
	import type { WatchlistStatus } from "@sora/sdk";
	import { CaretDownIcon } from "phosphor-svelte";

	import WatchlistSort, { sorts } from "./components/WatchlistSort.svelte";
	import { getWatchlist } from "./watchlist.remote";

	const watchlist = getWatchlist();

	let status = $state<WatchlistStatus | "all">("all");
	let sort = $state(sorts[0]);
	let statusSheet = $state(false);
	let sortSheet = $state(false);

	const options = [{ value: "all", label: "All" }, ...statuses] as const;
	const selected = $derived(options.find((option) => option.value === status));

	const batch = 36;
	let grown = $state({
		key: "",
		count: batch,
	});
	const key = $derived(`${status}:${sort.label}`);
	const limit = $derived(grown.key === key ? grown.count : batch);

	const matching = $derived(
		(watchlist.current ?? [])
			.filter((entry) => status === "all" || entry.status === status)
			.toSorted(sort.compare),
	);
	const shown = $derived(matching.slice(0, limit));
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
			<div class="flex items-center justify-between border-b border-border sm:hidden">
				<Button
					variant="text"
					class="font-normal"
					aria-label="Filter Watchlist, {selected?.label} selected"
					aria-haspopup="dialog"
					aria-controls="watchlist-status"
					onclick={() => (statusSheet = true)}
				>
					<CaretDownIcon size="0.875rem" weight="fill" />
					{selected?.label}
				</Button>
				<Button
					variant="text"
					class="font-normal"
					aria-label="Sort Watchlist, {sort.label} selected"
					aria-haspopup="dialog"
					aria-controls="watchlist-sort"
					onclick={() => (sortSheet = true)}
				>
					<CaretDownIcon size="0.875rem" weight="fill" />
					{sort.label}
				</Button>
			</div>

			<Tabs items={options} bind:value={status} label="Statuses" class="max-sm:hidden">
				{#snippet actions()}
					<div class="ml-auto">
						<WatchlistSort bind:sort />
					</div>
				{/snippet}

				{#snippet children(current)}
					{@const empty = statuses.find((option) => option.value === current)?.empty}
					{#if empty && watchlist.current && matching.length === 0}
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
										<Skeleton class="aspect-2/3" />
										<Skeleton class="mt-3 h-4 w-4/5" />
									</li>
								{/each}
							{/if}
						</ul>
						{#if watchlist.current && shown.length < matching.length}
							<Button
								variant="ghost"
								class="mx-auto mb-10 flex h-11 w-full max-w-5xl bg-[#213944] text-foreground hover:bg-[#2f5161]"
								onclick={() =>
									(grown = {
										key,
										count: limit + batch,
									})}
							>
								Show More
							</Button>
						{/if}
					{/if}
				{/snippet}
			</Tabs>
		{/if}
	</div>
</div>

<Sheet bind:open={statusSheet} id="watchlist-status" title="Status">
	{#each options as option (option.value)}
		<Button
			variant="item"
			aria-current={option.value === status ? "true" : undefined}
			onclick={() => {
				statusSheet = false;
				status = option.value;
			}}
		>
			{option.label}
		</Button>
	{/each}
</Sheet>

<Sheet bind:open={sortSheet} id="watchlist-sort" title="Sort By">
	{#each sorts as option (option.label)}
		<Button
			variant="item"
			aria-current={option === sort ? "true" : undefined}
			onclick={() => {
				sortSheet = false;
				sort = option;
			}}
		>
			{option.label}
		</Button>
	{/each}
</Sheet>
