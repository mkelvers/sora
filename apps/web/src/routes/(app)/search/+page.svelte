<script lang="ts">
	import { page } from "$app/state";
	import EmptyState from "$lib/components/EmptyState.svelte";
	import Skeleton from "$lib/components/snippets/Skeleton.svelte";
	import Button from "$lib/components/ui/Button.svelte";
	import { mascots } from "$lib/mascots";

	import Results from "./components/Results.svelte";

	const q = $derived(page.url.searchParams.get("q")?.trim() ?? "");
	let count = $derived(q ? 1 : 0);
</script>

<svelte:head>
	<title>{q ? `${q} · Search` : "Search"} · Sora</title>
</svelte:head>

<div class="flex page flex-col">
	{#if q}
		<h1 class="sr-only">Search results for {q}</h1>

		<ul
			class="grid flex-1 grid-cols-2 gap-x-4 gap-y-8 xs:grid-cols-3 md:grid-cols-4 md:gap-x-9 md:gap-y-12 xl:grid-cols-5 wide:grid-cols-6 hero:grid-cols-7"
		>
			{#each { length: count }, index (index)}
				<svelte:boundary>
					<Results {q} page={index + 1} last={index + 1 === count} onmore={() => (count += 1)} />

					{#snippet pending()}
						{#each { length: 12 }, index (index)}
							<li>
								<Skeleton class="aspect-2/3" />
								<Skeleton class="mt-3 h-4 w-4/5" />
							</li>
						{/each}
					{/snippet}

					{#snippet failed(_, reset)}
						<li class="col-span-full flex items-center gap-4 text-muted">
							<p>These results couldn’t be loaded.</p>
							<Button variant="ghost" onclick={reset}>Try Again</Button>
						</li>
					{/snippet}
				</svelte:boundary>
			{/each}
		</ul>
	{:else}
		<h1 class="sr-only">Search</h1>
		<div class="grid flex-1 place-items-center">
			<EmptyState
				class="w-full max-w-7xl py-16 sm:px-12 sm:py-22"
				mascot={mascots.search}
				title="Find something to watch."
				hint="Search for any anime by its title, your results will show up right here."
			/>
		</div>
	{/if}
</div>
