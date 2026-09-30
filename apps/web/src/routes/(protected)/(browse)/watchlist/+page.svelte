<script lang="ts">
	import emptySearch from "$lib/assets/illustrations/empty-search.webp";
	import emptyWatchlist from "$lib/assets/illustrations/empty-watchlist.webp";
	import EmptyState from "$lib/components/EmptyState.svelte";
	import ResetFilters from "$lib/components/ResetFilters.svelte";
	import Skeleton from "$lib/components/snippets/Skeleton.svelte";
	import type { LibraryItem, LibraryStatus } from "@sora/sdk";
	import { BookmarkSimpleIcon } from "phosphor-svelte";

	import WatchlistCard from "./_components/WatchlistCard.svelte";
	import WatchlistControls, {
		sorts,
		statuses,
		type WatchlistSort,
	} from "./_components/WatchlistControls.svelte";
	import { getWatchlist } from "./watchlist.remote";

	const watchlist = getWatchlist();

	let sort = $state<WatchlistSort>("recent");
	let status = $state<LibraryStatus>();
	const statusLabel = $derived(statuses.find((option) => option.value === status)?.label);

	const emptyFilter: Record<
		LibraryStatus,
		{
			title: string;
			hint: string;
		}
	> = {
		watching: {
			title: "You're not in the middle of anything.",
			hint: "Pick something from your list and press play.",
		},
		planning: {
			title: "Nothing lined up to watch next.",
			hint: "Add a few shows you've been meaning to start.",
		},
		completed: {
			title: "No finished shows here yet.",
			hint: "Every series you see through to the end lands here.",
		},
	};

	const compare: Record<typeof sort, ((left: LibraryItem, right: LibraryItem) => number) | null> = {
		recent: null,
		added: (left, right) => right.added_at.localeCompare(left.added_at),
		title: (left, right) => left.series.title.localeCompare(right.series.title),
	};

	const shown = $derived.by(() => {
		const entries = (watchlist.current ?? []).filter((entry) => !status || entry.status === status);
		const order = compare[sort];
		return order ? entries.toSorted(order) : entries;
	});
</script>

<svelte:head>
	<title>Watchlist · Sora</title>
</svelte:head>

<div
	class="min-h-[calc(100dvh-6.5rem)] bg-canvas px-[clamp(1rem,3.3vw,4rem)] pt-10 pb-10 text-foreground sm:min-h-[calc(100dvh-3.5rem)]"
>
	<h1 class="flex items-center justify-center gap-3 text-4xl font-semibold">
		<BookmarkSimpleIcon size="2.25rem" />
		Watchlist
	</h1>

	<section class="mx-auto mt-10 max-w-7xl border-t border-muted pt-6" aria-label="Your watchlist">
		{#if watchlist.current?.length === 0}
			<EmptyState
				image={emptyWatchlist}
				alt="Sora's mascot carrying a stack of poster cards to an empty box"
				width={720}
				height={700}
				title="Your watchlist is looking a little empty."
				hint="Let's fill it up with something to watch."
			/>
		{:else}
			<div class="mb-6 flex items-center justify-between gap-4">
				<div class="flex flex-col items-start">
					<h2 class="text-xl font-bold sm:text-2xl">
						{sorts.find((option) => option.value === sort)?.label}
					</h2>
					{#if statusLabel}
						<ResetFilters applied={statusLabel} onreset={() => (status = undefined)} />
					{/if}
				</div>
				<WatchlistControls bind:sort bind:status />
			</div>

			{#if status && watchlist.current && shown.length === 0}
				<EmptyState
					image={emptySearch}
					alt="Sora's mascot squinting at a poster card next to a tipped-over box"
					width={720}
					height={663}
					title={emptyFilter[status].title}
					hint={emptyFilter[status].hint}
				/>
			{:else}
				<ul class="grid grid-cols-1 gap-x-4 gap-y-6 pb-10 min-[30em]:grid-cols-2 lg:grid-cols-4">
					{#if watchlist.current}
						{#each shown as entry (entry.series.id)}
							<li><WatchlistCard {entry} /></li>
						{/each}
					{:else}
						{#each { length: 8 }, index (index)}
							<li class="p-2"><Skeleton class="aspect-video w-full" /></li>
						{/each}
					{/if}
				</ul>
			{/if}
		{/if}
	</section>
</div>
