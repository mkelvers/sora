<script lang="ts">
	import Button from "$lib/components/ui/Button.svelte";
	import Image from "$lib/components/ui/Image.svelte";
	import Tooltip from "$lib/components/ui/Tooltip.svelte";
	import { audioLabel, tmdbImage, tmdbSrcset } from "$lib/utils";
	import type { LibraryItem } from "@sora/sdk";
	import { TrashIcon } from "phosphor-svelte";

	import { getWatchlist, removeFromWatchlist } from "../watchlist.remote";

	let {
		entry,
	}: {
		entry: LibraryItem;
	} = $props();

	const { series, progress } = $derived(entry);
</script>

<div
	class="group flex h-full flex-col p-2 transition-colors focus-within:bg-surface hover:bg-surface"
>
	<a
		href="/series/{series.id}"
		class="block focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
	>
		<div class="relative aspect-video overflow-hidden bg-surface">
			{#if series.backdrop_url}
				<Image
					src={tmdbImage(series.backdrop_url, "w780")}
					srcset={tmdbSrcset(series.backdrop_url, { w780: 780, w1280: 1280 })}
					sizes="(min-width: 80rem) 19rem, (min-width: 64rem) 24vw, (min-width: 30em) 48vw, 100vw"
					alt=""
				/>
			{/if}
		</div>

		<div class="pt-3">
			<h3 class="text-sm leading-snug font-bold">{series.title}</h3>
			{#if progress.next}
				<p class="mt-1.5 text-sm text-muted">
					{progress.next.position_seconds > 0 ? "Continue watching" : "Start watching"}: E{progress
						.next.episode}
				</p>
			{/if}
		</div>
	</a>

	<div class="mt-auto flex items-center justify-between gap-3 pt-3">
		<p class="text-sm text-muted">{audioLabel(series.audio)}</p>
		<Tooltip text="Remove">
			{#snippet children(trigger)}
				<Button
					{...trigger}
					class="grid size-8 shrink-0 place-items-center text-muted transition-[color,transform] duration-150 hover:text-status-error active:scale-90"
					aria-label="Remove {series.title} from your watchlist"
					onclick={() =>
						removeFromWatchlist(series.id).updates(
							getWatchlist().withOverride((current) =>
								current.filter((other) => other.series.id !== series.id),
							),
						)}
				>
					<TrashIcon size="1.125rem" />
				</Button>
			{/snippet}
		</Tooltip>
	</div>
</div>
