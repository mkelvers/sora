<script lang="ts">
	import { cn, describeCard, tmdbImage, tmdbSrcset } from "$lib/utils";
	import { CaretRightIcon } from "phosphor-svelte";

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
	class={cn(
		"absolute inset-x-0 top-0 h-0.5 overflow-hidden",
		(typing || $effect.pending() > 0) && "busy",
	)}
	aria-hidden="true"
></div>

{#each found.results as card, index (card.id)}
	<a
		id="search-option-{index}"
		class="flex items-center gap-3.5 px-4 py-2 text-muted transition-colors hover:bg-white/8 aria-selected:bg-white/8"
		role="option"
		aria-selected={active === index}
		tabindex="-1"
		href="/series/{card.id}"
	>
		<span class="aspect-2/3 w-10 flex-none overflow-hidden bg-surface">
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
					class="size-full object-cover"
				/>
			{/if}
		</span>
		<span class="grid min-w-0 gap-0.75">
			<span class="truncate text-sm font-medium text-foreground">{card.title}</span>
			<span class="text-[13px] text-muted">{describeCard(card)}</span>
		</span>
	</a>
{:else}
	<p class="px-4 py-5 text-sm text-muted">
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
		class="mt-1 flex h-12 items-center justify-between gap-3.5 border-t border-white/6 px-4 text-sm text-muted transition-colors hover:bg-white/8 hover:text-foreground aria-selected:bg-white/8 aria-selected:text-foreground"
		role="option"
		aria-selected={active === found.results.length}
		tabindex="-1"
		href="/search?q={encodeURIComponent(text.trim())}"
	>
		<span class="truncate">See all results for “{text.trim()}”</span>
		<CaretRightIcon size="1.1rem" />
	</a>
{/if}

<style>
	.busy::after {
		content: "";
		display: block;
		width: 40%;
		height: 100%;
		background: linear-gradient(90deg, transparent, rgb(255 255 255 / 0.8), transparent);
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
</style>
