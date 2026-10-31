<script lang="ts">
	import Skeleton from "$lib/components/snippets/skeleton.svelte";

	import NotificationsView from "./components/notifications-view.svelte";
</script>

<svelte:head>
	<title>Notifications - Sora</title>
</svelte:head>

<svelte:boundary>
	<NotificationsView />

	{#snippet pending()}
		<div class="page">
			<div class="mx-auto max-w-7xl">
				<h1 class="mb-8 text-2xl font-bold">Notifications</h1>
				<div class="flex flex-col gap-4">
					{#each { length: 4 }, index (index)}
						<Skeleton class="h-24 w-full" />
					{/each}
				</div>
			</div>
		</div>
	{/snippet}
</svelte:boundary>
