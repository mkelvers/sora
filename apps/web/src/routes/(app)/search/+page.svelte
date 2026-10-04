<script lang="ts">
	import { page } from "$app/state";
	import search from "$lib/assets/illustrations/search.webp";
	import EmptyState from "$lib/components/EmptyState.svelte";
	import Poster from "$lib/components/Poster.svelte";
	import Button from "$lib/components/ui/Button.svelte";

	import Results from "./components/Results.svelte";

	const q = $derived(page.url.searchParams.get("q")?.trim() ?? "");
	let count = $derived(q ? 1 : 0);
</script>

<svelte:head>
	<title>{q ? `${q} · Search` : "Search"} · Sora</title>
</svelte:head>

<div
	class="min-h-[calc(100dvh-6.5rem)] bg-canvas px-[clamp(1rem,3.3vw,4rem)] pt-10 pb-20 text-foreground sm:min-h-[calc(100dvh-3.5rem)]"
>
	{#if q}
		<h1 class="sr-only">Search results for {q}</h1>

		<ul
			class="grid grid-cols-2 gap-x-4 gap-y-8 min-[30em]:grid-cols-3 md:grid-cols-4 md:gap-x-9 md:gap-y-12 xl:grid-cols-5 wide:grid-cols-6 hero:grid-cols-7"
		>
			{#each { length: count }, index (index)}
				<svelte:boundary>
					<Results {q} page={index + 1} last={index + 1 === count} onmore={() => (count += 1)} />

					{#snippet pending()}
						{#each { length: 12 }, index (index)}
							<li><Poster /></li>
						{/each}
					{/snippet}

					{#snippet failed(_, reset)}
						<li class="col-span-full flex items-center gap-4 text-muted">
							<p>These results couldn’t be loaded.</p>
							<Button variant="ghost" onclick={reset}>Try again</Button>
						</li>
					{/snippet}
				</svelte:boundary>
			{/each}
		</ul>
	{:else}
		<div class="grid min-h-[calc(100dvh-14rem)] place-items-center sm:min-h-[calc(100dvh-11rem)]">
			<div class="w-full max-w-5xl">
				<h1 class="mb-8 text-center text-2xl font-bold">Find something to watch</h1>
				<EmptyState
					image={search}
					alt="Sora's mascot peering through a magnifying glass"
					width={692}
					height={720}
					title="Search for any anime by its title."
					hint="Your results will show up right here."
				/>
			</div>
		</div>
	{/if}
</div>
