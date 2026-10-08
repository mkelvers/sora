<script lang="ts">
	import { page } from "$app/state";
	import EmptyState from "$lib/components/EmptyState.svelte";
	import { mascots } from "$lib/mascots";

	const missing = $derived(page.status === 404);
</script>

<svelte:head>
	<title>{missing ? "Page not found" : "Something went wrong"} · Sora</title>
</svelte:head>

<main id="main-content" tabindex="-1" class="grid min-h-dvh place-items-center px-5 py-10">
	<div>
		<h1 class="sr-only">{missing ? "Page not found" : "Something went wrong"}</h1>

		{#if missing}
			<EmptyState
				mascot={mascots.lost}
				title="This page wandered off."
				hint="Let's get you back to something to watch."
			/>
		{:else}
			<EmptyState
				mascot={mascots.lost}
				title="Something went wrong on our end."
				hint="Give it a moment and try again."
			/>
		{/if}
	</div>
</main>
