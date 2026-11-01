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
				<div class="flex h-12 items-center gap-4 border-b border-border" aria-hidden="true">
					<Skeleton class="h-4 w-12 sm:mx-5" />
					<Skeleton class="h-4 w-12" />
				</div>
				<ul class="flex flex-col gap-4 pt-6" aria-hidden="true">
					{#each { length: 3 }, index (index)}
						<li class="flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-8">
							<Skeleton class="aspect-video w-full shrink-0 sm:aspect-4/3 sm:w-[40%] sm:max-w-96" />
							<div class="w-full min-w-0 px-3 pb-1 sm:px-0 sm:pt-6 sm:pr-36 sm:pb-0">
								<Skeleton class="h-6 w-2/3 max-w-80" />
								<Skeleton class="mt-3 h-4 w-full max-w-md" />
								<Skeleton class="mt-4 h-4 w-24" />
							</div>
						</li>
					{/each}
				</ul>
			</div>
		</div>
	{/snippet}
</svelte:boundary>
