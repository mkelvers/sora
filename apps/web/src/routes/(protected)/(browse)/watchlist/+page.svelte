<script lang="ts">
	import emptySearch from "$lib/assets/illustrations/empty-search.webp";
	import emptyWatchlist from "$lib/assets/illustrations/empty-watchlist.webp";
	import EmptyState from "$lib/components/EmptyState.svelte";
	import Poster from "$lib/components/Poster.svelte";
	import ResetFilters from "$lib/components/ResetFilters.svelte";
	import { getListed } from "$lib/library.remote";
	import type { LibraryItem, LibraryStatus } from "@sora/sdk";
	import { BookmarkSimpleIcon } from "phosphor-svelte";

	import WatchlistControls, {
		sorts,
		statuses,
		type WatchlistSort,
	} from "./_components/WatchlistControls.svelte";
	import { getWatchlist } from "./watchlist.remote";

	const watchlist = getWatchlist();
	const listing = getListed();

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
		dropped: {
			title: "Nothing dropped. Everything's still in the running.",
			hint: "Shows you give up on land here, out of your way.",
		},
	};

	const compare: Record<typeof sort, ((left: LibraryItem, right: LibraryItem) => number) | null> = {
		recent: null,
		added: (left, right) => right.added_at.localeCompare(left.added_at),
		title: (left, right) => left.series.title.localeCompare(right.series.title),
	};

	const shown = $derived.by(() => {
		const entries = (watchlist.current ?? []).filter(
			(entry) =>
				(status ? entry.status === status : entry.status !== "dropped") &&
				(!listing.current || listing.current.includes(entry.series.id)),
		);
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
				<ul
					class="grid grid-cols-2 items-start gap-x-3 gap-y-8 pb-10 **:data-listed:hidden sm:grid-cols-3 sm:gap-x-4 md:grid-cols-4 lg:grid-cols-5 lg:gap-x-7.5 lg:gap-y-12 xl:grid-cols-6"
				>
					{#if watchlist.current}
						{#each shown as entry (entry.series.id)}
							{@const completed = entry.status === "completed"}
							{@const unwatched = completed ? entry.progress.unwatched_season : null}
							{@const next = unwatched
								? {
										season_id: unwatched.season_id,
										episode: 1,
										position_seconds: 0,
										duration_seconds: null,
									}
								: entry.progress.next}
							{@const more = unwatched !== null}
							<li class="relative [&_a>h3]:line-clamp-none [&_h3]:min-h-0">
								<Poster
									card={entry.series}
									resume={next && {
										series: entry.series,
										...next,
										last_watched_at: entry.progress.last_watched_at ?? entry.updated_at,
									}}
									meta={next && !completed
										? `${next.position_seconds > 0 ? "Continue" : "Start"}${entry.series.kind === "movie" ? "" : ` E${next.episode}`}`
										: undefined}
								/>
								{#if more}
									<span
										class="pointer-events-none absolute top-0 right-0 size-7 after:absolute after:inset-0 after:bg-accent after:[clip-path:polygon(0_0,100%_0,100%_100%)]"
									>
										<span class="sr-only">More to watch</span>
									</span>
								{/if}
							</li>
						{/each}
					{:else}
						{#each { length: 12 }, index (index)}
							<li><Poster /></li>
						{/each}
					{/if}
				</ul>
			{/if}
		{/if}
	</section>
</div>
