<script lang="ts">
	import { page } from '$app/state';
	import Poster from '$lib/components/Poster.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Results from './_components/Results.svelte';

	const q = $derived(page.url.searchParams.get('q')?.trim() ?? '');
	let count = $derived(q ? 1 : 0);
</script>

<svelte:head>
	<title>{q ? `${q} · Search` : 'Search'}</title>
</svelte:head>

<main class="min-h-[calc(100dvh-3.5rem)] bg-canvas px-[clamp(1rem,3.3vw,4rem)] pt-10 pb-20 text-foreground">
	{#if q}
		<h1 class="sr-only">Search results for {q}</h1>

		<ul class="grid grid-cols-2 gap-x-4 gap-y-8 md:grid-cols-4 md:gap-x-9 md:gap-y-12 wide:grid-cols-6 hero:grid-cols-7">
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
							<Button variant="ghost" class="px-3.5 py-2 text-foreground" onclick={reset}>Try again</Button>
						</li>
					{/snippet}
				</svelte:boundary>
			{/each}
		</ul>
	{:else}
		<div class="grid min-h-[50vh] place-content-center gap-2 text-center">
			<h1 class="text-2xl font-semibold">Find something to watch</h1>
			<p class="text-muted">Search by title in English, romaji, or Japanese.</p>
		</div>
	{/if}
</main>
