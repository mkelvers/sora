<script lang="ts">
	import favicon from '$lib/assets/favicon.png';
	import "./layout.css"

	let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

{@render children()}
