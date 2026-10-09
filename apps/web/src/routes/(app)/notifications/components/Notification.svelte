<script lang="ts">
	import Button from "$lib/components/ui/Button.svelte";
	import Image from "$lib/components/ui/Image.svelte";
	import Tooltip from "$lib/components/ui/Tooltip.svelte";
	import { cn, tmdbImage, tmdbSrcset } from "$lib/utils";
	import {
		dismissNotification,
		markNotificationsRead,
	} from "$routes/(app)/notifications/notifications.remote";
	import type { Notification } from "@sora/sdk";
	import { CaretRightIcon, CheckIcon, ClockIcon, TrashIcon } from "phosphor-svelte";

	let {
		item,
		unread,
	}: {
		item: Notification;
		unread: boolean;
	} = $props();
	const releasedAt = $derived.by(() => {
		const released = new Date(item.released_at);
		const time = new Intl.DateTimeFormat(undefined, {
			hour: "2-digit",
			minute: "2-digit",
			hourCycle: "h23",
		}).format(released);
		if (released.toDateString() === new Date().toDateString()) {
			return `Released at ${time}`;
		}
		const date = new Intl.DateTimeFormat(undefined, {
			dateStyle: "medium",
		}).format(released);
		return `Released on ${date} at ${time}`;
	});
</script>

<article
	class="group relative transition-colors focus-within:bg-hover hover:bg-hover"
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
					"after:absolute after:top-2.5 after:left-2.5 after:size-2.5 after:rounded-full after:bg-danger",
			)}
		>
			{#if item.series.backdrop_url}
				<Image
					src={tmdbImage(item.series.backdrop_url, "w780")}
					srcset={tmdbSrcset(item.series.backdrop_url, {
						w780: 780,
						w1280: 1280,
					})}
					sizes="(min-width: 60rem) 24rem, (min-width: 40rem) 40vw, 100vw"
					alt="Backdrop from {item.series.title}"
				/>
			{/if}
		</div>

		<div class="min-w-0 px-3 pb-1 sm:px-0 sm:pt-6 sm:pr-36 sm:pb-0">
			<h2 id="notification-{item.id}" class="text-lg leading-snug font-bold">
				{#if unread}<span class="sr-only">New:</span>{/if}
				{item.series.title}
			</h2>
			<p class="mt-2 text-sm text-muted sm:mt-3 sm:text-base">{item.message}</p>
			<p
				class="mt-1 inline-flex min-h-11 items-center gap-2 text-xs font-bold tracking-wide uppercase sm:mt-4 sm:min-h-0 sm:text-sm"
				aria-hidden="true"
			>
				View now
				<CaretRightIcon size="0.9rem" weight="bold" />
			</p>
		</div>
	</a>

	<div class="absolute right-1 bottom-1 flex items-center sm:top-3 sm:right-3 sm:bottom-auto">
		<Tooltip text={releasedAt}>
			{#snippet children(trigger)}
				<Button
					{...trigger}
					variant="icon"
					class="group-focus-within:opacity-100 group-hover:opacity-100 pointer-fine:opacity-0"
					aria-label={releasedAt}
				>
					<ClockIcon size="1.125rem" />
				</Button>
			{/snippet}
		</Tooltip>

		{#if unread}
			<Tooltip text="Mark as read">
				{#snippet children(trigger)}
					<Button
						{...trigger}
						variant="icon"
						class="group-focus-within:opacity-100 group-hover:opacity-100 pointer-fine:opacity-0"
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
					class="group-focus-within:opacity-100 group-hover:opacity-100 pointer-fine:opacity-0"
					aria-label="Delete notification about {item.series.title}"
					onclick={() => dismissNotification(item.id)}
				>
					<TrashIcon size="1.125rem" />
				</Button>
			{/snippet}
		</Tooltip>
	</div>
</article>
