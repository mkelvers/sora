<script lang="ts">
	import type { HistoryItem } from "@sora/sdk";
	import Button from "$lib/components/ui/Button.svelte";
	import Icon from "$lib/components/ui/Icon.svelte";
	import { tmdbImage } from "$lib/utils";
	import { forget, getHistory } from "./history.remote";

	let pages = $state(1);
	const history = $derived(await getHistory(pages));

	const days = $derived.by(() => {
		const grouped: {
			day: string;
			runs: HistoryItem[][];
		}[] = [];

		for (const item of history.items) {
			const day = new Date(item.watched_at).toLocaleDateString("en-GB", {
				weekday: "long",
				day: "numeric",
				month: "long",
				year: "numeric",
			});
			let group = grouped.at(-1);
			if (group?.day !== day) {
				group = {
					day,
					runs: [],
				};
				grouped.push(group);
			}

			const run = group.runs.at(-1);
			const last = run?.at(-1);

			if (
				run &&
				last &&
				last.completed &&
				item.completed &&
				last.season_id === item.season_id &&
				Math.abs(last.episode - item.episode) === 1
			) {
				run.push(item);
			} else {
				group.runs.push([item]);
			}
		}

		return grouped;
	});
</script>

<svelte:head>
	<title>History</title>
</svelte:head>

<div class="page">
	<header>
		<nav class="tabs" aria-label="Library">
			<a href="/list">Watchlist</a>
			<a href="/list/history" aria-current="page">History</a>
		</nav>
	</header>

	{#each days as { day, runs } (day)}
		<section>
			<h2>{day}</h2>

			<ol>
				{#each runs as run (`${run[0]!.season_id}:${run[0]!.episode}:${run[0]!.watched_at}`)}
					{@const latest = run[0]!}
					{@const numbers = run.map((item) => item.episode)}
					<li>
						<a
							class="entry"
							href="/series/{latest.series.id}/watch/{latest.season_id}/{latest.episode}"
						>
							<span class="poster">
								{#if latest.series.poster_url}
									<img
										src={tmdbImage(latest.series.poster_url, "w92")}
										alt=""
										loading="lazy"
									/>
								{/if}
							</span>

							<span class="text">
								<span class="title">{latest.series.title}</span>
								<span class="what">
									{latest.series.season_count > 1 ? `${latest.season_title} · ` : ""}
									{run.length > 1
										? `Episodes ${Math.min(...numbers)}–${Math.max(...numbers)}`
										: `Episode ${latest.episode}${latest.episode_title ? ` · ${latest.episode_title}` : ""}`}
								</span>
								{#if !latest.completed}
									<span class="left">
										{Math.max(1, Math.round((latest.duration_seconds - latest.position_seconds) / 60))} min left
									</span>
								{/if}
							</span>

							<time datetime={latest.watched_at}>
								{new Date(latest.watched_at).toLocaleTimeString("en-GB", {
									hour: "2-digit",
									minute: "2-digit",
								})}
							</time>
						</a>

						<Button
							variant="ghost"
							class="remove"
							aria-label="Remove from history"
							onclick={() =>
								forget(
									run.map((item) => ({
										seasonId: item.season_id,
										number: item.episode,
									})),
								).updates(getHistory(pages))}
						>
							<Icon name="close" size="sm" />
						</Button>
					</li>
				{/each}
			</ol>
		</section>
	{:else}
		<div class="empty">
			<h1>Nothing watched yet</h1>
			<p>Episodes you play show up here.</p>
		</div>
	{/each}

	{#if history.more}
		<Button class="more" onclick={() => (pages += 1)}>Show more</Button>
	{/if}
</div>

<style>
	.page {
		--side: clamp(16px, 3.3vw, 64px);

		display: grid;
		gap: 32px;
		max-width: 960px;
		padding: 32px var(--side) 80px;
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

	section {
		display: grid;
		gap: 8px;
	}

	h2 {
		margin: 0 0 4px;
		color: #999;
		font-size: 14px;
		font-weight: 600;
	}

	ol {
		display: grid;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	li {
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.entry {
		display: grid;
		flex: 1;
		grid-template-columns: 40px minmax(0, 1fr) auto;
		align-items: center;
		gap: 16px;
		min-width: 0;
		padding: 8px;
		color: inherit;
		text-decoration: none;
		transition: background 120ms;
	}

	.entry:hover {
		background: rgb(255 255 255 / 0.05);
	}

	.poster {
		display: block;
		aspect-ratio: 2 / 3;
		background: #222;
	}

	.poster img {
		display: block;
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.text {
		display: grid;
		gap: 2px;
		min-width: 0;
	}

	.title,
	.what {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.title {
		font-size: 15px;
		font-weight: 600;
	}

	.what,
	.left,
	time {
		color: #999;
		font-size: 13px;
	}

	.left {
		color: var(--accent);
	}

	time {
		font-variant-numeric: tabular-nums;
	}

	li :global(.remove) {
		padding: 8px;
		color: #777;
	}

	li :global(.remove:hover) {
		color: #fff;
	}

	.page > :global(.more) {
		justify-self: start;
		padding: 10px 18px;
		background: #1f1f1f;
		color: #ddd;
	}

	.page > :global(.more:hover) {
		background: #2a2a2a;
		color: #fff;
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
</style>
