<script lang="ts">
	import emptyHistory from "$lib/assets/illustrations/empty-history.webp";
	import emptySearch from "$lib/assets/illustrations/empty-search.webp";
	import emptyWatchlist from "$lib/assets/illustrations/empty-watchlist.webp";
	import EmptyState from "$lib/components/EmptyState.svelte";
	import Poster from "$lib/components/Poster.svelte";
	import ResetFilters from "$lib/components/ResetFilters.svelte";
	import Skeleton from "$lib/components/snippets/Skeleton.svelte";
	import Button from "$lib/components/ui/Button.svelte";
	import Tabs from "$lib/components/ui/Tabs.svelte";
	import { getHistory, getShows } from "$lib/shows.remote";
	import type { HistoryItem, Show } from "@sora/sdk";
	import { BookmarkSimpleIcon } from "phosphor-svelte";

	import HistoryCard from "./_components/HistoryCard.svelte";
	import ShowsControls, {
		filters,
		sorts,
		type ShowsFilter,
		type ShowsSort,
	} from "./_components/ShowsControls.svelte";
	import { forgetEpisode } from "./shows.remote";

	let tab = $state<"shows" | "history">("shows");
	const shows = getShows();
	let cursors = $state<(string | undefined)[]>([undefined]);
	const pages = $derived(cursors.map((after) => getHistory(after)));
	const history = $derived(
		pages[0]?.current ? pages.flatMap((page) => page.current?.items ?? []) : undefined,
	);
	const more = $derived(pages.at(-1)?.current?.next);

	function forget(item: HistoryItem) {
		const loaded = [...cursors];
		forgetEpisode({
			seriesId: item.series.id,
			seasonId: item.season_id,
			number: item.episode,
			pages: loaded.map((after) => after ?? null),
		}).updates(
			...loaded.map((after) =>
				getHistory(after).withOverride((current) => ({
					...current,
					items: current.items.filter(
						(other) => other.season_id !== item.season_id || other.episode !== item.episode,
					),
				})),
			),
		);
	}

	let sort = $state<ShowsSort>("recent");
	let filter = $state<ShowsFilter>();
	const filterLabel = $derived(filters.find((option) => option.value === filter)?.label);

	const emptyFilter: Record<
		ShowsFilter,
		{
			title: string;
			hint: string;
		}
	> = {
		watching: {
			title: "Nothing on the go right now.",
			hint: "Start an episode and the show lands here.",
		},
		planned: {
			title: "Nothing lined up to watch next.",
			hint: "Add a few shows you've been meaning to start.",
		},
		completed: {
			title: "Nothing finished yet.",
			hint: "Shows you watch to the end land here.",
		},
		dropped: {
			title: "Nothing dropped. Everything's still in the running.",
			hint: "Shows you give up on land here, out of your way.",
		},
	};

	const compare: Record<ShowsSort, ((left: Show, right: Show) => number) | null> = {
		recent: null,
		added: (left, right) => right.added_at.localeCompare(left.added_at),
		title: (left, right) => left.series.title.localeCompare(right.series.title),
	};

	const shown = $derived.by(() => {
		const entries = (shows.current ?? []).filter((show) =>
			filter ? show.status === filter : show.status !== "dropped",
		);
		const order = compare[sort];
		return order ? entries.toSorted(order) : entries;
	});
</script>

<svelte:head>
	<title>{tab === "history" ? "History" : "Shows"} · Sora</title>
</svelte:head>

<div
	class="min-h-[calc(100dvh-6.5rem)] bg-canvas px-[clamp(1rem,3.3vw,4rem)] pt-10 pb-10 text-foreground sm:min-h-[calc(100dvh-3.5rem)]"
>
	<h1 class="flex items-center justify-center gap-3 text-4xl font-semibold">
		<BookmarkSimpleIcon size="2.25rem" />
		My Shows
	</h1>

	<Tabs
		items={[
			{
				value: "shows",
				label: "Shows",
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
				{#if current === "shows" && shows.current?.length === 0}
					<EmptyState
						image={emptyWatchlist}
						alt="Sora's mascot carrying a stack of poster cards to an empty box"
						width={720}
						height={700}
						title="Your shows are looking a little empty."
						hint="Let's fill them up with something to watch."
					/>
				{:else if current === "shows"}
					<div class="mb-6 flex items-center justify-between gap-4">
						<div class="flex flex-col items-start">
							<h2 class="text-xl font-bold sm:text-2xl">
								{sorts.find((option) => option.value === sort)?.label}
							</h2>
							{#if filterLabel}
								<ResetFilters applied={filterLabel} onreset={() => (filter = undefined)} />
							{/if}
						</div>
						<ShowsControls bind:sort bind:filter />
					</div>

					{#if filter && shows.current && shown.length === 0}
						<EmptyState
							image={emptySearch}
							alt="Sora's mascot squinting at a poster card next to a tipped-over box"
							width={720}
							height={663}
							title={emptyFilter[filter].title}
							hint={emptyFilter[filter].hint}
						/>
					{:else}
						<ul
							class="grid grid-cols-2 items-start gap-x-3 gap-y-8 pb-10 **:data-listed:hidden sm:grid-cols-3 sm:gap-x-4 md:grid-cols-4 lg:grid-cols-5 lg:gap-x-7.5 lg:gap-y-12 xl:grid-cols-6"
						>
							{#if shows.current}
								{#each shown as show (show.series.id)}
									<li class="[&_a>h3]:line-clamp-none [&_h3]:min-h-0">
										<Poster card={show.series} />
									</li>
								{/each}
							{:else}
								{#each { length: 12 }, index (index)}
									<li><Poster /></li>
								{/each}
							{/if}
						</ul>
					{/if}
				{:else if history?.length === 0}
					<EmptyState
						image={emptyHistory}
						alt="Sora's mascot on a floor cushion with cheeks full of popcorn"
						width={690}
						height={720}
						title="Nothing watched yet."
						hint="Play an episode and it'll show up here."
					/>
				{:else}
					<ul class="grid grid-cols-1 gap-x-4 gap-y-6 pb-10 min-[30em]:grid-cols-2 lg:grid-cols-4">
						{#if history}
							{#each history as item (`${item.season_id}:${item.episode}`)}
								<li><HistoryCard {item} onremove={() => forget(item)} /></li>
							{/each}
						{:else}
							{#each { length: 8 }, index (index)}
								<li class="p-2"><Skeleton class="aspect-video w-full" /></li>
							{/each}
						{/if}
					</ul>
					{#if more}
						<Button variant="outline" class="mx-auto flex" onclick={() => cursors.push(more)}>
							Show More
						</Button>
					{/if}
				{/if}
			</div>
		{/snippet}
	</Tabs>
</div>
