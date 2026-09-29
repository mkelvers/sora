<script lang="ts">
	import emptyNotifications from "$lib/assets/illustrations/empty-notifications.webp";
	import EmptyState from "$lib/components/EmptyState.svelte";
	import Button from "$lib/components/ui/Button.svelte";
	import Dropdown from "$lib/components/ui/Dropdown.svelte";
	import { CaretDownIcon, ChecksIcon } from "phosphor-svelte";

	import { getNotifications, markNotificationsSeen } from "../home.remote";
	import Notification from "./_components/Notification.svelte";

	const items = $derived(await getNotifications());
	const unread = $derived(items.filter((item) => item.unread));
	const read = $derived(items.filter((item) => !item.unread));

	let view = $state<"new" | "past">("new");
	const shown = $derived(view === "new" ? unread : read);
</script>

<svelte:head>
	<title>Notifications · Sora</title>
</svelte:head>

<main class="mx-auto w-full max-w-7xl px-5 py-10 sm:px-10">
	<h1 class="mb-8 text-center text-2xl font-bold">Notification Center</h1>

	{#if !items.length}
		<EmptyState
			image={emptyNotifications}
			alt="Sora's mascot asleep against a big golden bell"
			width={720}
			height={703}
			title="All quiet for now."
			hint="We'll ring the bell when new episodes arrive."
		/>
	{:else}
		<div class="mb-6 flex min-h-12 items-center justify-between gap-4 border-b border-muted">
			<div
				class="text-base font-bold [&_.dropdown-trigger]:gap-2 [&_.dropdown-trigger]:px-0 [&_.dropdown-trigger]:normal-case [&_.dropdown-trigger]:group-has-[.dropdown-menu:popover-open]:bg-transparent! [&_.dropdown-trigger]:hover:bg-transparent!"
			>
				<Dropdown alignment="left">
					{#snippet trigger()}
						{#if view === "new"}
							New Notifications
						{:else}
							Past Notifications
						{/if}
						<CaretDownIcon size="1rem" weight="bold" />
					{/snippet}
					{#snippet children()}
						<div role="menu" aria-label="Show notifications">
							<Button
								role="menuitemradio"
								aria-checked={view === "new"}
								variant="item"
								class="aria-checked:text-foreground"
								onclick={() => (view = "new")}
							>
								New Notifications
							</Button>
							<Button
								role="menuitemradio"
								aria-checked={view === "past"}
								variant="item"
								class="aria-checked:text-foreground"
								onclick={() => (view = "past")}
							>
								Past Notifications
							</Button>
						</div>
					{/snippet}
				</Dropdown>
			</div>

			{#if view === "new" && unread.length}
				<Button variant="ghost" onclick={() => markNotificationsSeen(unread[0]!.released_at)}>
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
		{:else}
			{#if view === "new"}
				<EmptyState
					image={emptyNotifications}
					alt="Sora's mascot asleep against a big golden bell"
					width={720}
					height={703}
					title="You're all caught up."
					hint="New episodes and dub releases from your watchlist will appear here."
				/>
			{:else}
				<EmptyState
					image={emptyNotifications}
					alt="Sora's mascot asleep against a big golden bell"
					width={720}
					height={703}
					title="No past notifications yet."
					hint="Notifications you mark as read will be kept here for 30 days."
				/>
			{/if}
		{/if}
	{/if}
</main>
