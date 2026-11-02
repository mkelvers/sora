<script lang="ts">
	import favicon from "$lib/assets/favicon.png";

	import "./layout.css";

	let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<link rel="preconnect" href="https://image.tmdb.org" />
	<meta name="theme-color" content="#000000" />
	<meta property="og:site_name" content="Sora" />
</svelte:head>

{@render children()}
