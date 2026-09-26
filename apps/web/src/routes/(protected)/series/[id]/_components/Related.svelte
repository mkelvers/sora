<script lang="ts">
	import type { SeriesCard } from "@sora/sdk";
	import { tmdbImage, tmdbSrcset } from "$lib/utils";

	type Props = {
		related: SeriesCard[];
	};

	let { related }: Props = $props();
</script>

<section aria-labelledby="related">
	<h2 id="related">More from the franchise</h2>

	<ul>
		{#each related as card (card.id)}
			<li>
				<a href="/series/{card.id}">
					<div class="poster">
						{#if card.poster_url}
							<img
								src={tmdbImage(card.poster_url, "w342")}
								srcset={tmdbSrcset(card.poster_url, {
									w185: 185,
									w342: 342,
								})}
								sizes="148px"
								alt=""
								loading="lazy"
								decoding="async"
							/>
						{/if}
					</div>
					<span class="title">{card.title}</span>
					{#if card.year}
						<span class="year">{card.year}</span>
					{/if}
				</a>
			</li>
		{/each}
	</ul>
</section>

<style>
	h2 {
		margin: 0 0 16px;
		font-size: 20px;
		font-weight: 400;
	}

	ul {
		display: grid;
		grid-auto-columns: 148px;
		grid-auto-flow: column;
		gap: 16px;
		margin: 0;
		padding: 0 0 8px;
		overflow: auto hidden;
		list-style: none;
		scroll-snap-type: x proximity;
		scrollbar-width: thin;
	}

	li {
		scroll-snap-align: start;
	}

	a {
		display: grid;
		gap: 2px;
		color: inherit;
		text-decoration: none;
	}

	a:focus-visible {
		outline: 2px solid #fff;
		outline-offset: 2px;
	}

	.poster {
		aspect-ratio: 2 / 3;
		margin-bottom: 8px;
		overflow: hidden;
		background: #2a2a2a;
	}

	.poster img {
		display: block;
		width: 100%;
		height: 100%;
		object-fit: cover;
		transition: opacity 120ms;
	}

	a:hover .poster img {
		opacity: 0.8;
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

	.year {
		color: #999;
		font-size: 13px;
	}
</style>
