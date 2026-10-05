<script lang="ts">
	import EmptyState from "$lib/components/EmptyState.svelte";
	import Button from "$lib/components/ui/Button.svelte";
	import Dropdown from "$lib/components/ui/Dropdown.svelte";
	import { mascots } from "$lib/mascots";
	import { pollWhileVisible } from "$lib/utils";
	import { CaretDownIcon, ChecksIcon } from "phosphor-svelte";

	import Notification from "./components/Notification.svelte";
	import { getNotifications, markNotificationsRead } from "./notifications.remote";

	const notifications = getNotifications();
	const unread = $derived(notifications.current?.filter((item) => item.unread) ?? []);
	const read = $derived(notifications.current?.filter((item) => !item.unread) ?? []);

	const views = [
		{
			value: "new" as const,
			label: "New Notifications",
		},
		{
			value: "past" as const,
			label: "Past Notifications",
		},
	];

	let view = $state<(typeof views)[number]["value"]>("new");
	const current = $derived(views.find((option) => option.value === view)!);
	const shown = $derived(view === "new" ? unread : read);

	$effect(() => pollWhileVisible(() => notifications.refresh()));
</script>

<svelte:head>
	<title>Notifications · Sora</title>
</svelte:head>

<div class="mx-auto w-full max-w-7xl px-5 py-10 sm:px-10">
	<h1 class="mb-8 text-center text-2xl font-bold">Notification Center</h1>

	{#if notifications.current?.length === 0}
		<EmptyState
			mascot={mascots.emptyNotifications}
			title="All quiet for now."
			hint="We'll ring the bell when new episodes and dubs of your watchlist arrive."
		/>
	{:else}
		<div class="mb-6 flex min-h-12 items-center justify-between gap-4 border-b border-muted">
			<Dropdown
				alignment="left"
				variant="toolbar"
				class="w-52"
				label="Show notifications, {current.label} selected"
			>
				{#snippet trigger()}
					<CaretDownIcon size="0.875rem" weight="fill" />
					{current.label}
				{/snippet}

				{#snippet children()}
					<div role="menu" aria-label="Show notifications">
						{#each views as option (option.value)}
							<Button
								role="menuitemradio"
								aria-checked={option.value === view}
								onclick={() => (view = option.value)}
								variant="item"
							>
								{option.label}
							</Button>
						{/each}
					</div>
				{/snippet}
			</Dropdown>

			{#if view === "new" && unread.length}
				<Button
					variant="ghost"
					class="hover:bg-transparent"
					onclick={() => markNotificationsRead(unread.map((item) => item.id))}
				>
					<ChecksIcon size="1.125rem" />
					Mark all as read
				</Button>
			{/if}
		</div>

		{#if shown.length}
			<ul
				class="flex flex-col gap-4"
				aria-label={view === "new" ? "New notifications" : "Past notifications"}
			>
				{#each shown as item (item.id)}
					<li><Notification {item} unread={view === "new"} /></li>
				{/each}
			</ul>
		{:else if notifications.current}
			{#if view === "new"}
				<EmptyState
					mascot={mascots.emptyNotifications}
					title="You're all caught up."
					hint="New episodes, dubs and sequels of your watchlist will appear here."
				/>
			{:else}
				<EmptyState
					mascot={mascots.emptyNotifications}
					title="No past notifications yet."
					hint="Notifications you mark as read are kept here for 30 days."
				/>
			{/if}
		{/if}
	{/if}
</div>
