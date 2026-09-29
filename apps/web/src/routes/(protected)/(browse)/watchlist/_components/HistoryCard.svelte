<script lang="ts">
	import Button from "$lib/components/ui/Button.svelte";
	import Image from "$lib/components/ui/Image.svelte";
	import Tooltip from "$lib/components/ui/Tooltip.svelte";
	import { tmdbImage, tmdbSrcset } from "$lib/utils";
	import type { HistoryItem } from "@sora/sdk";
	import { TrashIcon } from "phosphor-svelte";

	import { forgetEpisode, getHistory } from "../watchlist.remote";

	let {
		item,
	}: {
		item: HistoryItem;
	} = $props();

	const image = $derived(item.episode_still_url ?? item.series.backdrop_url);
</script>

<article
	class="group flex h-full flex-col p-2 transition-colors focus-within:bg-surface hover:bg-surface"
>
	<a
		href="/series/{item.series.id}/watch/{item.season_id}/{item.episode}"
		class="block focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
	>
		<div class="relative aspect-video overflow-hidden bg-surface">
			{#if image}
				<Image
					src={tmdbImage(image, "w780")}
					srcset={tmdbSrcset(image, {
						w780: 780,
						w1280: 1280,
					})}
					sizes="(min-width: 80rem) 19rem, (min-width: 64rem) 24vw, (min-width: 30em) 48vw, 100vw"
					alt="Still from episode {item.episode} of {item.series.title}"
				/>
			{/if}
			<span
				class="absolute right-2 bottom-2 bg-black/75 px-1.5 py-0.5 text-xs font-bold text-white"
			>
				{#if item.duration_seconds > 0}
					<span class="group-focus-within:hidden group-hover:hidden">
						{#if item.watched}
							Watched
						{:else}
							Ongoing
						{/if}
					</span>
					<span class="hidden group-focus-within:inline group-hover:inline">
						{Math.round(item.duration_seconds / 60)}m
					</span>
				{:else}
					{#if item.watched}
						Watched
					{:else}
						Ongoing
					{/if}
				{/if}
			</span>
		</div>

		<div class="pt-3">
			<p class="text-[0.6875rem] font-semibold tracking-wide text-muted uppercase">
				{item.series.title}
			</p>
			<h3 class="mt-1.5 text-sm leading-snug font-bold">
				E{item.episode}
				{#if item.episode_title}
					- {item.episode_title}
				{/if}
			</h3>
		</div>
	</a>

	<div class="mt-auto flex items-center justify-between gap-3 pt-3">
		<time class="text-sm text-muted" datetime={item.played_at}>
			{new Date(item.played_at).toLocaleDateString("en-US", {
				month: "short",
				day: "numeric",
				year: "numeric",
			})}
		</time>
		<Tooltip text="Remove">
			{#snippet children(trigger)}
				<Button
					{...trigger}
					class="grid size-8 shrink-0 place-items-center text-muted transition-[color,transform] duration-150 hover:text-status-error active:scale-90"
					aria-label="Remove E{item.episode} of {item.series.title} from your history"
					onclick={() =>
						forgetEpisode({
							seasonId: item.season_id,
							number: item.episode,
						}).updates(
							getHistory().withOverride((current) =>
								current.filter(
									(other) => other.season_id !== item.season_id || other.episode !== item.episode,
								),
							),
						)}
				>
					<TrashIcon size="1.125rem" />
				</Button>
			{/snippet}
		</Tooltip>
	</div>
</article>
