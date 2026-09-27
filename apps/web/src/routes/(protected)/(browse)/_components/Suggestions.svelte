<script lang="ts">
	import Icon from "$lib/components/ui/Icon.svelte";
	import { describeCard, tmdbImage, tmdbSrcset } from "$lib/utils";
	import { searchSeries } from "../search/search.remote";

	let {
		term,
		text,
		active,
		typing,
	}: {
		term: string;
		text: string;
		active: number;
		typing: boolean;
	} = $props();

	const found = $derived(
		await searchSeries({
			q: term,
			page: 1,
			perPage: 6,
		}),
	);

	$effect(() => {
		if (!found.meta.preparing) {
			return;
		}

		const timer = setTimeout(
			() =>
				searchSeries({
					q: term,
					page: 1,
					perPage: 6,
				}).refresh(),
			3000,
		);

		return () => clearTimeout(timer);
	});
</script>

<div
	class={["progress", (typing || $effect.pending() > 0) && "busy"]}
	aria-hidden="true"
></div>

{#each found.results as card, index (card.id)}
	<a
		id="search-option-{index}"
		class="option"
		role="option"
		aria-selected={active === index}
		tabindex="-1"
		href="/series/{card.id}"
	>
		<span class="poster">
			{#if card.poster_url}
				<img
					src={tmdbImage(card.poster_url, "w92")}
					srcset={tmdbSrcset(card.poster_url, {
						w92: 92,
						w185: 185,
					})}
					sizes="40px"
					alt=""
					decoding="async"
				/>
			{/if}
		</span>
		<span class="text">
			<span class="title">{card.title}</span>
			<span class="meta">{describeCard(card)}</span>
		</span>
	</a>
{:else}
	<p class="empty">
		{#if found.meta.preparing}
			Looking further for “{term}”…
		{:else}
			No titles match “{term}”
		{/if}
	</p>
{/each}

{#if found.results.length}
	<a
		id="search-option-{found.results.length}"
		class="option all"
		role="option"
		aria-selected={active === found.results.length}
		tabindex="-1"
		href="/search?q={encodeURIComponent(text.trim())}"
	>
		<span>See all results for “{text.trim()}”</span>
		<Icon name="chevron-right" size="md" />
	</a>
{/if}

<style>
	.progress {
		position: absolute;
		inset: 0 0 auto;
		height: 2px;
		overflow: hidden;
	}

	.progress.busy::after {
		content: "";
		display: block;
		width: 40%;
		height: 100%;
		background: linear-gradient(
			90deg,
			transparent,
			rgb(255 255 255 / 0.8),
			transparent
		);
		animation: sweep 900ms ease-in-out infinite;
	}

	@keyframes sweep {
		from {
			translate: -100%;
		}
		to {
			translate: 250%;
		}
	}

	.option {
		display: flex;
		align-items: center;
		gap: 14px;
		padding: 8px 16px;
		color: #bbb;
		text-decoration: none;
		transition: background 120ms;
	}

	.option:hover,
	.option[aria-selected="true"] {
		background: rgb(255 255 255 / 0.08);
	}

	.poster {
		flex: none;
		width: 40px;
		aspect-ratio: 2 / 3;
		overflow: hidden;
		background: #2a2a2a;
	}

	.poster img {
		display: block;
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.text {
		display: grid;
		gap: 3px;
		min-width: 0;
	}

	.title {
		overflow: hidden;
		color: #fff;
		font-size: 14px;
		font-weight: 500;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.meta {
		color: #888;
		font-size: 13px;
	}

	.all {
		justify-content: space-between;
		height: 48px;
		margin-top: 4px;
		padding-block: 0;
		border-top: 1px solid rgb(255 255 255 / 0.06);
		font-size: 14px;
	}

	.all:hover,
	.all[aria-selected="true"] {
		color: #fff;
	}

	.all span {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.empty {
		margin: 0;
		padding: 20px 16px;
		color: #888;
		font-size: 14px;
	}
</style>
