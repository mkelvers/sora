<script lang="ts">
	import EmptyState from "$lib/components/EmptyState.svelte";
	import Button from "$lib/components/ui/Button.svelte";
	import Tabs from "$lib/components/ui/Tabs.svelte";
	import { mascots } from "$lib/mascots";
	import { pollWhileVisible } from "$lib/utils";
	import { ChecksIcon } from "phosphor-svelte";

	import Notification from "./components/Notification.svelte";
	import {
		getNotifications,
		getUnreadNotifications,
		markNotificationsRead,
	} from "./notifications.remote";

	const notifications = getNotifications();
	const items = $derived(notifications.current?.items);
	const unread = $derived(items?.filter((item) => item.unread) ?? []);
	const read = $derived(items?.filter((item) => !item.unread) ?? []);

	const views = [
		{
			value: "new",
			label: "New",
		},
		{
			value: "past",
			label: "Past",
		},
	] as const;

	let view = $state<(typeof views)[number]["value"]>("new");
	const shown = $derived(view === "new" ? unread : read);

	$effect(() => pollWhileVisible(() => notifications.refresh()));

	$effect(() => {
		const count = notifications.current?.unread;
		if (count !== undefined) {
			getUnreadNotifications().set(count);
		}
	});
</script>

<svelte:head>
	<title>Notifications · Sora</title>
</svelte:head>

<div class="page">
	<div class="mx-auto max-w-7xl">
		<h1 class="mb-8 text-2xl font-bold">Notifications</h1>

		{#if items?.length === 0}
			<EmptyState
				mascot={mascots.emptyNotifications}
				title="All quiet for now."
				hint="We'll ring the bell when new episodes and dubs of shows you saved or watched arrive."
			/>
		{:else}
			<Tabs items={views} bind:value={view} label="Notifications" panelClass="pt-6">
				{#snippet actions()}
					{#if view === "new" && unread.length}
						<Button
							variant="ghost"
							class="ml-auto"
							onclick={() => markNotificationsRead(unread.map((item) => item.id))}
						>
							<ChecksIcon size="1.125rem" />
							<span class="max-sm:sr-only">Mark All as Read</span>
						</Button>
					{/if}
				{/snippet}

				{#snippet children(current)}
					{#if shown.length}
						<ul
							class="flex flex-col gap-4"
							aria-label={current === "new" ? "New notifications" : "Past notifications"}
						>
							{#each shown as item (item.id)}
								<li><Notification {item} unread={current === "new"} /></li>
							{/each}
						</ul>
					{:else if items}
						{#if current === "new"}
							<EmptyState
								mascot={mascots.emptyNotifications}
								title="You're all caught up."
								hint="New episodes, dubs and seasons of shows you saved or watched will appear here."
							/>
						{:else}
							<EmptyState
								mascot={mascots.emptyNotifications}
								title="No past notifications yet."
								hint="Notifications you mark as read are kept here for 30 days."
							/>
						{/if}
					{/if}
				{/snippet}
			</Tabs>
		{/if}
	</div>
</div>
