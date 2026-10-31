<script lang="ts">
	import Skeleton from "$lib/components/snippets/skeleton.svelte";

	import CalendarView from "./components/calendar-view.svelte";
</script>

<svelte:head>
	<title>Anime Release Calendar - Sora</title>
</svelte:head>

<svelte:boundary>
	<CalendarView />

	{#snippet pending()}
		<div class="page overflow-x-clip">
			<section class="mx-auto w-full max-w-7xl" aria-labelledby="calendar-title">
				<h1 id="calendar-title" class="mb-8 text-2xl font-bold">Release Calendar</h1>
				<Skeleton class="mb-8 h-20 w-full" />
				<div class="flex flex-col gap-8 sm:gap-10">
					{#each { length: 3 }, index (index)}
						<Skeleton class="h-32 w-full" />
					{/each}
				</div>
			</section>
		</div>
	{/snippet}
</svelte:boundary>
