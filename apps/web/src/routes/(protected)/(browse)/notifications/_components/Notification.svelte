<script lang="ts">
	import { goto } from "$app/navigation";
	import Button from "$lib/components/ui/Button.svelte";
	import Image from "$lib/components/ui/Image.svelte";
	import Tooltip from "$lib/components/ui/Tooltip.svelte";
	import { cn, tmdbImage, tmdbSrcset } from "$lib/utils";
	import type { Notification } from "@sora/sdk";
	import { CaretRightIcon, TrashIcon } from "phosphor-svelte";

	import { dismissNotification } from "../../home.remote";

	let {
		item,
		unread,
	}: {
		item: Notification;
		unread: boolean;
	} = $props();

	const image = $derived(item.series.backdrop_url);

	const detail = $derived.by(() => {
		const title = item.series.title;
		const season = item.season.title;
		const count = item.last_episode - item.first_episode + 1;

		if (item.kind === "season") {
			if (item.season.kind === "movie") {
				return `${season} has arrived. A new chapter of ${title} is here, ready whenever you are.`;
			}

			if (item.season.kind === "ova") {
				return `A new OVA just dropped: ${season}. A little extra time with ${title}.`;
			}

			return count > 1
				? `${title} is back! ${season} has started, and ${count} episodes are waiting for you.`
				: `${title} is back! ${season} has started with its first episode.`;
		}

		if (count === 1) {
			return item.episode_title
				? `Episode ${item.last_episode} of ${season} is out: “${item.episode_title}”. Settle in and catch up.`
				: `Episode ${item.last_episode} of ${season} is out. Settle in and catch up.`;
		}

		return `${count} new episodes of ${season} are out, ${item.first_episode} through ${item.last_episode}. Plenty to dig into.`;
	});
</script>

<article class="group relative transition-colors focus-within:bg-surface hover:bg-surface">
	<a
		href="/series/{item.series.id}"
		onclick={(event) => {
			if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
				return;
			}

			event.preventDefault();
			goto(`/series/${item.series.id}`, {
				state: {
					seasonId: item.season.id,
				},
			});
		}}
		class="flex flex-col gap-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:flex-row sm:items-start sm:gap-8"
	>
		<div
			class={cn(
				"relative aspect-video w-full shrink-0 bg-surface sm:aspect-4/3 sm:w-[40%] sm:max-w-96",
				unread &&
					"after:absolute after:top-2.5 after:left-2.5 after:size-2.5 after:rounded-full after:bg-status-error after:ring-2 after:ring-black/40",
			)}
		>
			{#if image}
				<Image
					src={tmdbImage(image, "w780")}
					srcset={tmdbSrcset(image, {
						w780: 780,
						w1280: 1280,
					})}
					sizes="(min-width: 60rem) 24rem, (min-width: 40rem) 40vw, 100vw"
					alt="Backdrop from {item.series.title}"
					loading="lazy"
				/>
			{/if}
		</div>

		<div class="min-w-0 px-3 pb-1 sm:px-0 sm:pt-6 sm:pr-14 sm:pb-0">
			<h2 class="text-lg leading-snug font-bold sm:text-xl">
				{#if unread}<span class="sr-only">New:</span>{/if}
				{item.series.title}
			</h2>
			<p class="mt-2 text-sm text-muted sm:mt-3 sm:text-base">{detail}</p>
			<p
				class="mt-1 inline-flex min-h-11 items-center gap-2 text-xs font-bold tracking-wide uppercase sm:mt-4 sm:min-h-0 sm:text-sm"
			>
				View now
				<CaretRightIcon size="0.9rem" weight="bold" />
			</p>
		</div>
	</a>

	<Tooltip text="Delete">
		{#snippet children(trigger)}
			<Button
				{...trigger}
				class="absolute right-1 bottom-1 grid size-11 place-items-center text-muted transition-[color,opacity,transform] duration-150 group-focus-within:opacity-100 group-hover:opacity-100 hover:text-status-error active:scale-90 sm:top-3 sm:right-3 sm:bottom-auto sm:size-9 pointer-fine:opacity-0"
				aria-label="Delete notification about {item.series.title}"
				onclick={() => dismissNotification(item.id)}
			>
				<TrashIcon size="1.125rem" />
			</Button>
		{/snippet}
	</Tooltip>
</article>
