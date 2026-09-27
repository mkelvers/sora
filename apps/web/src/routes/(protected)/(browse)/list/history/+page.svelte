<script lang="ts">
	import type { HistoryItem } from "@sora/sdk";
	import { XIcon } from "phosphor-svelte";
	import Button from "$lib/components/ui/Button.svelte";
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
	<title>History · Sora</title>
</svelte:head>

<main class="min-h-[calc(100dvh-3.5rem)] bg-canvas text-foreground">
	<div class="mx-auto w-full max-w-5xl px-5 py-9 sm:px-10 sm:py-11 lg:px-16 lg:py-14">
		<nav class="flex gap-6" aria-label="Library">
			<a href="/list" class="text-2xl font-semibold text-subtle transition-colors hover:text-foreground">Watchlist</a>
			<a href="/list/history" class="text-2xl font-semibold" aria-current="page">History</a>
		</nav>

		{#each days as { day, runs } (day)}
			<section class="mt-10">
				<h2 class="mb-3 border-b border-border pb-3 text-xs font-bold text-muted uppercase">{day}</h2>

				<ol>
					{#each runs as run (`${run[0]!.season_id}:${run[0]!.episode}:${run[0]!.watched_at}`)}
						{@const latest = run[0]!}
						{@const numbers = run.map((item) => item.episode)}
						<li class="group flex items-center gap-2">
							<a
								class="grid min-w-0 flex-1 grid-cols-[2.75rem_minmax(0,1fr)_auto] items-center gap-4 p-2 transition-colors hover:bg-surface"
								href="/series/{latest.series.id}/watch/{latest.season_id}/{latest.episode}"
							>
								<span class="block aspect-2/3 bg-surface">
									{#if latest.series.poster_url}
										<img
											src={tmdbImage(latest.series.poster_url, "w92")}
											alt=""
											loading="lazy"
											class="size-full object-cover"
										/>
									{/if}
								</span>

								<span class="grid min-w-0 gap-0.5">
									<span class="truncate text-sm font-semibold">{latest.series.title}</span>
									<span class="truncate text-sm text-muted">
										{latest.series.season_count > 1 ? `${latest.season_title} · ` : ""}{run.length > 1
											? `Episodes ${Math.min(...numbers)}–${Math.max(...numbers)}`
											: `E${latest.episode}${latest.episode_title ? ` – ${latest.episode_title}` : ""}`}
									</span>
									{#if !latest.completed}
										<span class="text-xs text-accent">
											{Math.max(1, Math.round((latest.duration_seconds - latest.position_seconds) / 60))} min left
										</span>
									{/if}
								</span>

								<time class="text-xs text-muted tabular-nums" datetime={latest.watched_at}>
									{new Date(latest.watched_at).toLocaleTimeString("en-GB", {
										hour: "2-digit",
										minute: "2-digit",
									})}
								</time>
							</a>

							<Button
								class="grid size-9 place-items-center text-subtle opacity-0 transition-[color,opacity] group-hover:opacity-100 hover:text-status-error focus-visible:opacity-100"
								aria-label="Remove from history"
								onclick={() =>
									forget(
										run.map((item) => ({
											seasonId: item.season_id,
											number: item.episode,
										})),
									).updates(getHistory(pages))}
							>
								<XIcon size="1rem" weight="bold" />
							</Button>
						</li>
					{/each}
				</ol>
			</section>
		{:else}
			<section class="mt-8 grid min-h-112 place-items-center border border-dashed border-border px-6 py-12 text-center">
				<div>
					<h2 class="text-xl font-bold sm:text-2xl">Nothing watched yet</h2>
					<p class="mt-3 text-sm text-muted sm:text-base">Episodes you play show up here.</p>
				</div>
			</section>
		{/each}

		{#if history.more}
			<Button
				class="mx-auto mt-10 flex min-h-11 w-full max-w-md items-center justify-center bg-episode-action px-5 text-xs font-bold uppercase hover:bg-episode-action-hover"
				onclick={() => (pages += 1)}
			>
				Show more
			</Button>
		{/if}
	</div>
</main>
