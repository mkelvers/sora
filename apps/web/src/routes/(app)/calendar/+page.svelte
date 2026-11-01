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
				<div class="mb-6 flex items-center justify-between gap-2 sm:mb-8 sm:gap-4">
					<div class="flex flex-col items-start">
						<h1 id="calendar-title" class="text-2xl font-bold">Release Calendar</h1>
						<Skeleton class="mt-2 h-3.5 w-40" />
					</div>
					<div class="flex items-center gap-1" aria-hidden="true">
						<Skeleton class="size-11" />
						<Skeleton class="size-11" />
					</div>
				</div>

				<div class="mb-2 flex h-11 items-center sm:hidden" aria-hidden="true">
					<Skeleton class="h-4 w-28" />
				</div>

				<div class="grid grid-cols-7 max-sm:hidden" aria-hidden="true">
					{#each { length: 7 }, index (index)}
						<div class="flex min-h-20 flex-col items-center justify-center gap-1 py-2">
							<Skeleton class="h-3 w-8" />
							<Skeleton class="h-7 w-7" />
						</div>
					{/each}
				</div>

				<ol class="flex flex-col gap-8 pt-6 pb-10 sm:gap-10 sm:pt-8" aria-hidden="true">
					{#each { length: 2 }, slot (slot)}
						<li class="grid gap-4 sm:grid-cols-[7rem_minmax(0,1fr)] sm:gap-6">
							<Skeleton class="h-7 w-20 sm:h-8" />
							<ul class="grid gap-x-5 gap-y-5 sm:grid-cols-2 sm:gap-y-6 lg:grid-cols-3">
								{#each { length: slot === 0 ? 3 : 2 }, card (card)}
									<li
										class="grid grid-cols-[40%_minmax(0,1fr)] content-start gap-x-3 sm:flex sm:flex-col"
									>
										<Skeleton class="row-span-3 aspect-video w-full self-start" />
										<Skeleton class="mt-1 h-4 w-3/4 sm:mt-3" />
										<Skeleton class="mt-2 h-3.5 w-1/2" />
									</li>
								{/each}
							</ul>
						</li>
					{/each}
				</ol>
			</section>
		</div>
	{/snippet}
</svelte:boundary>
