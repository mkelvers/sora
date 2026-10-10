<script lang="ts">
	import favicon from "$lib/assets/favicon.png";
	import font from "@fontsource-variable/dm-sans/files/dm-sans-latin-wght-normal.woff2?url";

	import "./layout.css";

	let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<link rel="preload" href={font} as="font" type="font/woff2" crossorigin="anonymous" />
	<meta name="theme-color" content="#000000" />
	<meta property="og:site_name" content="Sora" />
</svelte:head>

{@render children()}
