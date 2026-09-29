<script lang="ts">
	import emptyNotifications from "$lib/assets/illustrations/empty-notifications.webp";
	import EmptyState from "$lib/components/EmptyState.svelte";
	import { untrack } from "svelte";

	import { getNotifications, markNotificationsSeen } from "../home.remote";
	import Notification from "./_components/Notification.svelte";

	const items = $derived(await getNotifications());
	const unread = untrack(() => new Set(items.filter((item) => item.unread).map((item) => item.id)));

	$effect(() => {
		if (items.some((item) => item.unread)) {
			untrack(() => markNotificationsSeen(items[0]!.released_at));
		}
	});
</script>

<svelte:head>
	<title>Notifications · Sora</title>
</svelte:head>

<main class="mx-auto w-full max-w-5xl px-5 py-10 sm:px-10">
	<h1 class="mb-8 text-center text-2xl font-bold">Notification Center</h1>

	{#if items.length}
		<ul class="flex flex-col gap-4" aria-label="Notifications">
			{#each items as item (item.id)}
				<li><Notification {item} unread={unread.has(item.id)} /></li>
			{/each}
		</ul>
	{:else}
		<EmptyState
			image={emptyNotifications}
			alt="Sora's mascot asleep against a big golden bell"
			width={720}
			height={703}
			title="All quiet for now."
			hint="We'll ring the bell when new episodes arrive."
		/>
	{/if}
</main>
