<script lang="ts">
	import favicon from '$lib/assets/favicon.png';
	import './layout.css';

	let {
		data,
		children,
	} = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

{#if data.mobile}
	<main class="grid min-h-dvh place-content-center gap-2 bg-canvas p-6 text-center text-foreground">
		<h1 class="text-2xl font-semibold">Sora is made for desktop</h1>
		<p class="text-muted">Open it on a computer to watch. A mobile app is on its way.</p>
	</main>
{:else}
	{@render children()}
{/if}
