<script lang="ts">
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

	<div class="flex flex-col gap-4">
		{#each items as item (item.id)}
			<Notification {item} unread={unread.has(item.id)} />
		{/each}
	</div>
</main>
