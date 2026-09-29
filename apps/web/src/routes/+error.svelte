<script lang="ts">
	import { page } from "$app/state";
	import lost from "$lib/assets/illustrations/lost.webp";
	import EmptyState from "$lib/components/EmptyState.svelte";

	const missing = $derived(page.status === 404);
</script>

<svelte:head>
	<title>{missing ? "Page Not Found" : "Something Went Wrong"} · Sora</title>
</svelte:head>

<main class="grid min-h-dvh place-items-center bg-canvas px-5 py-10 text-foreground">
	<div class="w-full max-w-5xl">
		<h1 class="mb-8 text-center text-2xl font-bold">
			{missing ? "We couldn't find this page" : "Well, that didn't go as planned"}
		</h1>

		{#if missing}
			<EmptyState
				image={lost}
				width={701}
				height={720}
				title="This page wandered off."
				hint="Let's get you back to something to watch."
			/>
		{:else}
			<EmptyState
				image={lost}
				width={701}
				height={720}
				title="Something went wrong on our end."
				hint="Give it a moment and try again."
			/>
		{/if}
	</div>
</main>
