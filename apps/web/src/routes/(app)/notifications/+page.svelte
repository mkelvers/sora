<script lang="ts">
	import EmptyState from "$lib/components/EmptyState.svelte";
	import Button from "$lib/components/ui/Button.svelte";
	import Tabs from "$lib/components/ui/Tabs.svelte";
	import { mascots } from "$lib/mascots";
	import { getNotifications, markNotificationsRead } from "$lib/notifications.remote";
	import { BellSimpleIcon, ChecksIcon } from "phosphor-svelte";

	import Notification from "./components/Notification.svelte";

	const notifications = getNotifications();
	const items = $derived(notifications.current ?? []);
	const unread = $derived(items.filter((item) => item.unread));
	const read = $derived(items.filter((item) => !item.unread));

	let view = $state<"new" | "past">("new");

	const tabs = [
		{
			value: "new" as const,
			label: "New",
		},
		{
			value: "past" as const,
			label: "Past",
		},
	];

	$effect(() => {
		const check = () => {
			if (document.visibilityState === "visible") {
				notifications.refresh();
			}
		};
		const timer = setInterval(check, 30_000);
		document.addEventListener("visibilitychange", check);

		return () => {
			clearInterval(timer);
			document.removeEventListener("visibilitychange", check);
		};
	});
</script>

<svelte:head>
	<title>Notifications · Sora</title>
</svelte:head>

<div class="min-h-page bg-canvas px-[clamp(1rem,3.3vw,4rem)] pt-10 pb-10 text-foreground">
	<h1 class="flex items-center justify-center gap-3 text-4xl font-semibold">
		<BellSimpleIcon size="2.25rem" />
		Notifications
	</h1>

	<div class="mx-auto mt-10 max-w-7xl">
		{#if notifications.current?.length === 0}
			<EmptyState
				mascot={mascots.emptyNotifications}
				title="All quiet for now."
				hint="We'll ring the bell when new episodes and dubs of your watchlist arrive."
			/>
		{:else}
			<Tabs items={tabs} bind:value={view} label="Notifications">
				{#snippet actions()}
					{#if view === "new" && unread.length}
						<Button
							variant="ghost"
							class="ml-auto"
							onclick={() => markNotificationsRead(unread.map((item) => item.id))}
						>
							<ChecksIcon size="1.125rem" />
							Mark all as read
						</Button>
					{/if}
				{/snippet}

				{#snippet children(current)}
					{@const shown = current === "new" ? unread : read}
					{#if shown.length}
						<ul
							class="flex flex-col gap-4 pt-6 pb-10"
							aria-label="{current === 'new' ? 'New' : 'Past'} notifications"
						>
							{#each shown as item (item.id)}
								<li><Notification {item} unread={current === "new"} /></li>
							{/each}
						</ul>
					{:else if notifications.current}
						<EmptyState
							mascot={mascots.emptyNotifications}
							title={current === "new" ? "You're all caught up." : "No past notifications yet."}
							hint={current === "new"
								? "New episodes, dubs and sequels of your watchlist will appear here."
								: "Notifications you mark as read are kept here for 30 days."}
						/>
					{/if}
				{/snippet}
			</Tabs>
		{/if}
	</div>
</div>
