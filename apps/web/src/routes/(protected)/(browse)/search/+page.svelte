<script lang="ts">
	import { goto } from "$app/navigation";
	import { page } from "$app/state";
	import { untrack } from "svelte";
	import Poster from "$lib/components/Poster.svelte";
	import Button from "$lib/components/ui/Button.svelte";
	import Input from "$lib/components/ui/Input.svelte";
	import Results from "./_components/Results.svelte";

	const q = $derived(page.url.searchParams.get("q")?.trim() ?? "");
	let text = $state(untrack(() => q));
	let count = $derived(q ? 1 : 0);

	$effect(() => {
		const value = text.trim();
		if (value === untrack(() => q)) {
			return;
		}

		const timer = setTimeout(
			() =>
				goto(value ? `/search?q=${encodeURIComponent(value)}` : "/search", {
					replaceState: true,
					keepFocus: true,
					noScroll: true,
				}),
			250,
		);

		return () => clearTimeout(timer);
	});
</script>

<svelte:head>
	<title>{q ? `${q} · Search` : "Search"}</title>
</svelte:head>

<main class="min-h-dvh overflow-x-clip bg-canvas text-foreground">
	<h1 class="sr-only">Search</h1>
	<section class="bg-search px-5 py-7 sm:px-10 sm:py-9 lg:px-16">
		<form
			action="/search"
			class="mx-auto max-w-6xl"
			role="search"
			onsubmit={(event) => event.preventDefault()}
		>
			<label for="series-search" class="sr-only">Search</label>
			<Input
				id="series-search"
				name="q"
				type="search"
				placeholder="Search by title in English, romaji, or Japanese"
				autocomplete="off"
				bind:value={text}
				{@attach (node) => {
					if (window.matchMedia("(pointer: fine)").matches) {
						node.focus();
					}
				}}
				class="h-14 border-0 border-b-2 border-accent bg-transparent px-0 text-2xl placeholder:text-subtle focus-visible:border-accent focus-visible:ring-0 sm:text-3xl"
			/>
		</form>
	</section>

	<div class="mx-auto w-full max-w-6xl px-5 py-7 sm:px-10 sm:py-9 lg:px-0 lg:py-10">
		{#if q}
			<ul class="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-5 lg:gap-x-7">
				{#each { length: count }, index (index)}
					<svelte:boundary>
						<Results
							{q}
							page={index + 1}
							last={index + 1 === count}
							onmore={() => (count += 1)}
						/>

						{#snippet pending()}
							{#each { length: 10 }, index (index)}
								<li><Poster /></li>
							{/each}
						{/snippet}

						{#snippet failed(_, reset)}
							<li class="col-span-full flex items-center gap-4 text-muted">
								<p>These results couldn’t be loaded.</p>
								<Button class="min-h-9 px-4 text-xs font-bold text-foreground uppercase" onclick={reset}>
									Try again
								</Button>
							</li>
						{/snippet}
					</svelte:boundary>
				{/each}
			</ul>
		{/if}
	</div>
</main>
