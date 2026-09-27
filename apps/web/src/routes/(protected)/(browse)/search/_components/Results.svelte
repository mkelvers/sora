<script lang="ts">
	import { describeCard, tmdbImage, tmdbSrcset } from "$lib/utils";
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
	const stale = $derived($effect.pending() > 0);

	$effect(() => {
		if (!found.meta.preparing) {
			return;
		}

		const timer = setTimeout(
			() => searchSeries({ q, page, perPage: 24 }).refresh(),
			3000,
		);

		return () => clearTimeout(timer);
	});
</script>

{#each found.results as card (card.id)}
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

	a {
		display: grid;
		gap: 2px;
		color: inherit;
		text-decoration: none;
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
