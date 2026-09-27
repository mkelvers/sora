<script lang="ts">
	import { page } from "$app/state";
	import Button from "$lib/components/ui/Button.svelte";
	import Poster from "$lib/components/Poster.svelte";
	import Results from "./_components/Results.svelte";

	const q = $derived(page.url.searchParams.get("q")?.trim() ?? "");
	let count = $derived(q ? 1 : 0);
</script>

<svelte:head>
	<title>{q ? `${q} · Search` : "Search"}</title>
</svelte:head>

<div class="page">
	{#if q}
		<h1 class="hidden">Search results for {q}</h1>

		<ul class="grid">
			{#each { length: count }, index (index)}
				<svelte:boundary>
					<Results
						{q}
						page={index + 1}
						last={index + 1 === count}
						onmore={() => (count += 1)}
					/>

					{#snippet pending()}
						{#each { length: 12 }, index (index)}
							<li><Poster /></li>
						{/each}
					{/snippet}

					{#snippet failed(_, reset)}
						<li class="failed">
							<p>These results couldn’t be loaded.</p>
							<Button variant="ghost" onclick={reset}>Try again</Button>
						</li>
					{/snippet}
				</svelte:boundary>
			{/each}
		</ul>
	{:else}
		<div class="prompt">
			<h1>Find something to watch</h1>
			<p>Search by title in English, romaji, or Japanese.</p>
		</div>
	{/if}
</div>

<style>
	.page {
		--side: clamp(16px, 3.3vw, 64px);

		padding: 40px var(--side) 80px;
	}

	.hidden {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
	}

	.grid {
		display: grid;
		grid-template-columns: repeat(
			auto-fill,
			minmax(clamp(140px, 11vw, 240px), 1fr)
		);
		gap: 48px 36px;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.failed {
		display: flex;
		grid-column: 1 / -1;
		align-items: center;
		gap: 16px;
		color: #888;
		font-size: 15px;
	}

	.failed p {
		margin: 0;
	}

	.failed :global(.button) {
		padding: 8px 14px;
		color: #fff;
	}

	.prompt {
		display: grid;
		place-content: center;
		gap: 8px;
		min-height: 50vh;
		text-align: center;
	}

	.prompt h1 {
		margin: 0;
		font-size: 24px;
	}

	.prompt p {
		margin: 0;
		color: #999;
		font-size: 15px;
	}
</style>
