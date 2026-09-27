<script lang="ts">
	import favicon from "$lib/assets/favicon.png";
	import "./layout.css";

	let {
		data,
		children,
	} = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

{#if data.mobile}
	<main>
		<h1>Sora is made for desktop</h1>
		<p>Open it on a computer to watch. A mobile app is on its way.</p>
	</main>
{:else}
	{@render children()}
{/if}

<style>
	main {
		display: grid;
		place-content: center;
		gap: 8px;
		box-sizing: border-box;
		min-height: 100vh;
		padding: 24px;
		text-align: center;
	}

	h1 {
		margin: 0;
		font-size: 24px;
		font-weight: 400;
	}

	p {
		margin: 0;
		color: #999;
		font-size: 15px;
	}
</style>
