<script lang="ts">
	import { navigating } from "$app/state";
	import Skeleton from "$lib/components/snippets/Skeleton.svelte";
	import { describeCard, tmdbImage, tmdbSrcset } from "$lib/utils";
	import type { PreparingTitle, SeriesCard } from "@sora/sdk";
	import { searchSeries } from "../search.remote";

	let {
		q,
		page,
		last,
		onmore,
	}: {
		q: string;
		page: number;
		last: boolean;
		onmore: () => void;
	} = $props();

	const found = $derived(await searchSeries({ q, page, perPage: 24 }));
	const stale = $derived(navigating.to?.url.pathname === "/search");

	const formats: Partial<Record<NonNullable<PreparingTitle["format"]>, string>> = {
		TV: "Series",
		TV_SHORT: "Series",
		ONA: "Series",
		MOVIE: "Movie",
	};

	const items = $derived.by(() => {
		const merged: (
			| { key: string; card: SeriesCard; preparing?: never }
			| { key: string; preparing: PreparingTitle; card?: never }
		)[] = found.results.map((card) => ({ key: card.id, card }));

		for (const preparing of found.meta.preparing_titles.toSorted(
			(left, right) => left.position - right.position,
		)) {
			merged.splice(Math.min(preparing.position, merged.length), 0, {
				key: `anilist:${preparing.anilist_id}`,
				preparing,
			});
		}

		return merged;
	});

	$effect(() => {
		if (!found.meta.preparing) {
			return;
		}

		const timer = setTimeout(
			() => searchSeries({ q, page, perPage: 24 }).refresh(),
			1000,
		);

		return () => clearTimeout(timer);
	});
</script>

{#each items as { key, card, preparing } (key)}
	{#if preparing}
		<li class={["preparing", stale && "stale"]} aria-busy="true">
			<div class="poster">
				<Skeleton height="100%" />
			</div>
			<span class="title">{preparing.title}</span>
			<span class="meta">
				{[preparing.year, preparing.format && formats[preparing.format], "Preparing"]
					.filter(Boolean)
					.join(" · ")}
			</span>
		</li>
	{:else if card}
		<li class={[stale && "stale"]}>
			<a href="/series/{card.id}">
				<div class="poster">
					{#if card.poster_url}
						<img
							src={tmdbImage(card.poster_url, "w342")}
							srcset={tmdbSrcset(card.poster_url, {
								w185: 185,
								w342: 342,
								w500: 500,
							})}
							sizes="(min-width: 1800px) 240px, 180px"
							alt=""
							loading="lazy"
							decoding="async"
						/>
					{:else}
						<span class="fallback">{card.title}</span>
					{/if}
				</div>
				<span class="title">{card.title}</span>
				<span class="meta">{describeCard(card)}</span>
			</a>
		</li>
	{/if}
{:else}
	{#if page === 1}
		<li class={["empty", stale && "stale"]}>
			{#if found.meta.preparing}
				<p class="headline">Looking further for “{q}”…</p>
				<p>Some matching titles are still being prepared.</p>
			{:else}
				<p class="headline">No titles match “{q}”</p>
				<p>Check the spelling, or try the English or Japanese title.</p>
			{/if}
		</li>
	{/if}
{/each}

{#if last && found.meta.has_next_page}
	<li
		class="sentinel"
		aria-hidden="true"
		{@attach (node) => {
			const observer = new IntersectionObserver(
				(entries) => {
					if (entries.some((entry) => entry.isIntersecting)) {
						onmore();
					}
				},
				{ rootMargin: "800px 0px" },
			);

			observer.observe(node);
			return () => observer.disconnect();
		}}
	></li>
{/if}

<style>
	li {
		transition: opacity 160ms;
	}

	.stale {
		opacity: 0.5;
	}

	a,
	.preparing {
		display: grid;
		align-content: start;
		gap: 2px;
		color: inherit;
		text-decoration: none;
	}

	.preparing .title {
		color: #bbb;
	}

	a:focus-visible {
		outline: 2px solid #fff;
		outline-offset: 4px;
	}

	.poster {
		display: grid;
		aspect-ratio: 2 / 3;
		margin-bottom: 10px;
		overflow: hidden;
		background: #202020;
	}

	.poster img {
		display: block;
		width: 100%;
		height: 100%;
		object-fit: cover;
		transition:
			scale 320ms cubic-bezier(0.2, 0.8, 0.2, 1),
			opacity 160ms;
	}

	a:hover .poster img {
		scale: 1.04;
		opacity: 0.85;
	}

	.fallback {
		align-self: end;
		padding: 16px;
		color: #777;
		font-size: 14px;
		line-height: 1.35;
	}

	.title {
		display: -webkit-box;
		overflow: hidden;
		font-size: 14px;
		line-height: 1.35;
		-webkit-box-orient: vertical;
		-webkit-line-clamp: 2;
		line-clamp: 2;
	}

	.meta {
		color: #888;
		font-size: 13px;
	}

	.empty,
	.sentinel {
		grid-column: 1 / -1;
	}

	.empty {
		padding: 64px 0;
	}

	.empty p {
		margin: 0;
		color: #888;
		font-size: 15px;
	}

	.empty .headline {
		margin-bottom: 8px;
		color: #fff;
		font-size: 20px;
	}

	.sentinel {
		height: 1px;
	}
</style>
