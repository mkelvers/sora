<script lang="ts">
	import favicon from "$lib/assets/favicon.png";

	import "./layout.css";

	let { data, children } = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<meta name="description" content="Watch anime with Sora." />
	<meta name="theme-color" content="#000000" />
	<meta property="og:site_name" content="Sora" />
</svelte:head>

{@render children()}
