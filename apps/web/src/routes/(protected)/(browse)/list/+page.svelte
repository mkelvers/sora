<script lang="ts">
	import { page } from "$app/state";
	import Item from "./_components/Item.svelte";
	import { getWatchlist, setDropped, unlist } from "./list.remote";

	const statuses = [
		{
			value: undefined,
			label: "All",
		},
		{
			value: "watching",
			label: "Watching",
		},
		{
			value: "planning",
			label: "Plan to Watch",
		},
		{
			value: "completed",
			label: "Completed",
		},
		{
			value: "dropped",
			label: "Dropped",
		},
	] as const;

	const status = $derived(
		statuses.find(
			(option) => option.value === page.url.searchParams.get("status"),
		)?.value,
	);
	const list = $derived(await getWatchlist(status));
	const total = $derived(
		Object.values(list.counts).reduce((sum, count) => sum + count, 0),
	);

	$effect(() => {
		if (list.preparing === 0) {
			return;
		}

		const timer = setTimeout(() => getWatchlist(status).refresh(), 5000);

		return () => clearTimeout(timer);
	});
</script>

<svelte:head>
	<title>Watchlist</title>
</svelte:head>

<div class="page">
	<header>
		<nav class="tabs" aria-label="Library">
			<a href="/list" aria-current="page">Watchlist</a>
			<a href="/list/history">History</a>
		</nav>

		<a class="import" href="/list/import">Import from AniList</a>
	</header>

	<nav class="filters" aria-label="Status">
		{#each statuses as option (option.label)}
			<a
				href={option.value ? `/list?status=${option.value}` : "/list"}
				aria-current={option.value === status ? "page" : undefined}
			>
				{option.label}
				<span class="count">
					{option.value ? list.counts[option.value] : total}
				</span>
			</a>
		{/each}
	</nav>

	{#if list.preparing > 0}
		<p class="preparing">
			{list.preparing}
			{list.preparing === 1 ? "imported title is" : "imported titles are"}
			still being prepared. They’ll appear here as they’re ready.
		</p>
	{/if}

	{#if list.items.length > 0}
		<ul class="grid">
			{#each list.items as item (item.series.id)}
				<Item
					{item}
					ondrop={(dropped) =>
						setDropped({
							seriesId: item.series.id,
							dropped,
						}).updates(getWatchlist(status))}
					onunlist={() =>
						unlist(item.series.id).updates(
							getWatchlist(status).withOverride((current) => ({
								...current,
								items: current.items.filter(
									(other) => other.series.id !== item.series.id,
								),
							})),
						)}
				/>
			{/each}
		</ul>
	{:else}
		<div class="empty">
			{#if total === 0}
				<h1>Your watchlist is empty</h1>
				<p>
					Add titles with the bookmark on any poster, or
					<a href="/list/import">import your AniList list</a>.
				</p>
			{:else}
				<p>Nothing here.</p>
			{/if}
		</div>
	{/if}
</div>

<style>
	.page {
		--side: clamp(16px, 3.3vw, 64px);

		display: grid;
		gap: 24px;
		padding: 32px var(--side) 80px;
	}

	header {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 16px;
	}

	.tabs {
		display: flex;
		gap: 28px;
	}

	.tabs a {
		padding-bottom: 6px;
		border-bottom: 2px solid transparent;
		color: #888;
		font-size: 22px;
		text-decoration: none;
	}

	.tabs a:hover {
		color: #fff;
	}

	.tabs a[aria-current="page"] {
		border-color: var(--accent);
		color: #fff;
	}

	.import {
		color: #aaa;
		font-size: 14px;
	}

	.import:hover {
		color: #fff;
	}

	.filters {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}

	.filters a {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		padding: 8px 14px;
		background: #1f1f1f;
		color: #bbb;
		font-size: 14px;
		text-decoration: none;
		transition:
			background 120ms,
			color 120ms;
	}

	.filters a:hover {
		background: #2a2a2a;
		color: #fff;
	}

	.filters a[aria-current="page"] {
		background: #fff;
		color: #111;
	}

	.count {
		opacity: 0.6;
		font-variant-numeric: tabular-nums;
	}

	.preparing {
		margin: 0;
		color: #999;
		font-size: 14px;
	}

	.grid {
		display: grid;
		grid-template-columns: repeat(
			auto-fill,
			minmax(clamp(140px, 11vw, 240px), 1fr)
		);
		gap: 40px 36px;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.empty {
		display: grid;
		place-content: center;
		gap: 8px;
		min-height: 40vh;
		text-align: center;
	}

	.empty h1 {
		margin: 0;
		font-size: 24px;
		font-weight: 400;
	}

	.empty p {
		margin: 0;
		color: #999;
		font-size: 15px;
	}

	.empty a {
		color: #fff;
	}
</style>
