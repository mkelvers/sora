<script lang="ts">
	import Button from "$lib/components/ui/Button.svelte";
	import Image from "$lib/components/ui/Image.svelte";
	import Tooltip from "$lib/components/ui/Tooltip.svelte";
	import { dismissNotification, markNotificationsRead } from "$lib/notifications.remote";
	import { cn, tmdbImage, tmdbSrcset } from "$lib/utils";
	import type { Notification } from "@sora/sdk";
	import { CaretRightIcon, CheckIcon, TrashIcon } from "phosphor-svelte";

	let {
		item,
		unread,
	}: {
		item: Notification;
		unread: boolean;
	} = $props();

	const image = $derived(item.series.backdrop_url);

	const detail = $derived.by(() => {
		const count = item.last_episode - item.first_episode + 1;
		const isFilm = item.series.format === "MOVIE";

		if (item.kind === "dub") {
			if (isFilm) {
				return "It is now dubbed in English. Ready whenever you are.";
			}

			if (count === 1) {
				return `Episode ${item.last_episode} is now dubbed in English.`;
			}

			return `${count} episodes are now dubbed in English, ${item.first_episode} through ${item.last_episode}.`;
		}

		if (item.kind === "premiere") {
			if (isFilm) {
				return "It has arrived, ready whenever you are.";
			}

			if (count > 1) {
				return `It has started, and ${count} episodes are waiting for you.`;
			}

			return "It has started with its first episode.";
		}

		if (count === 1 && item.episode_title) {
			return `Episode ${item.last_episode} is out: “${item.episode_title}”. Settle in and catch up.`;
		}

		if (count === 1) {
			return `Episode ${item.last_episode} is out. Settle in and catch up.`;
		}

		return `${count} new episodes are out, ${item.first_episode} through ${item.last_episode}. Plenty to dig into.`;
	});
</script>

<article
	class="group relative transition-colors focus-within:bg-white/5 hover:bg-white/5"
	aria-labelledby="notification-{item.id}"
>
	<a
		href="/series/{item.series.id}"
		class="flex flex-col gap-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:flex-row sm:items-start sm:gap-8"
	>
		<div
			class={cn(
				"relative aspect-video w-full shrink-0 bg-surface sm:aspect-4/3 sm:w-[40%] sm:max-w-96",
				unread &&
					"after:absolute after:top-2.5 after:left-2.5 after:size-2.5 after:bg-status-error",
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
				/>
			{/if}
		</div>

		<div class="min-w-0 px-3 pb-1 sm:px-0 sm:pt-6 sm:pr-24 sm:pb-0">
			<h2 id="notification-{item.id}" class="text-lg leading-snug font-bold sm:text-xl">
				{#if unread}<span class="sr-only">New:</span>{/if}
				{item.series.title}
			</h2>
			<p class="mt-2 text-sm text-muted sm:mt-3 sm:text-base">{detail}</p>
			<p
				class="mt-1 inline-flex min-h-11 items-center gap-2 text-xs font-bold tracking-wide uppercase sm:mt-4 sm:min-h-0 sm:text-sm"
				aria-hidden="true"
			>
				View now
				<CaretRightIcon size="0.9rem" weight="bold" />
			</p>
		</div>
	</a>

	{#if unread}
		<Tooltip text="Mark as read">
			{#snippet children(trigger)}
				<Button
					{...trigger}
					variant="icon"
					class="absolute right-12 bottom-1 size-11 group-focus-within:opacity-100 group-hover:opacity-100 sm:top-3 sm:right-14 sm:bottom-auto sm:size-9 pointer-fine:opacity-0"
					aria-label="Mark notification about {item.series.title} as read"
					onclick={() => markNotificationsRead([item.id])}
				>
					<CheckIcon size="1.125rem" />
				</Button>
			{/snippet}
		</Tooltip>
	{/if}

	<Tooltip text="Delete">
		{#snippet children(trigger)}
			<Button
				{...trigger}
				variant="icon"
				tone="danger"
				class="absolute right-1 bottom-1 size-11 group-focus-within:opacity-100 group-hover:opacity-100 sm:top-3 sm:right-3 sm:bottom-auto sm:size-9 pointer-fine:opacity-0"
				aria-label="Delete notification about {item.series.title}"
				onclick={() => dismissNotification(item.id)}
			>
				<TrashIcon size="1.125rem" />
			</Button>
		{/snippet}
	</Tooltip>
</article>
