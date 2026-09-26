<script lang="ts">
	import favicon from '$lib/assets/favicon.png';
	import { page } from '$app/state';
	import Header from './_components/Header.svelte';
	import './layout.css';

	let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

{#if !page.route.id?.startsWith('/series/[id]/watch')}
	<Header />
{/if}

{@render children()}
