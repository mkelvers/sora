<script lang="ts">
	import { page } from '$app/state';
	import favicon from '$lib/assets/favicon.png';
	import Nav from './_components/Nav.svelte';
	import './layout.css';

	let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

{#if page.route.id?.startsWith('/series/[id]/watch') || page.route.id === '/login' || page.route.id === '/profiles'}
	{@render children()}
{:else}
	<Nav />
	{@render children()}
{/if}
