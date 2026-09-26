<script lang="ts">
	import { onMount } from 'svelte';
	import { afterNavigate } from '$app/navigation';
	import { page } from '$app/state';
	import favicon from '$lib/assets/favicon.png';
	import Header from './_components/Header.svelte';
	import Sidebar from './_components/Sidebar.svelte';
	import './layout.css';

	let { children } = $props();

	const wide = '(min-width: 1000px)';
	const remembered = 'sidebar-collapsed';

	/** Wide screens dock the sidebar; this hides it, and is remembered. */
	let collapsed = $state(false);
	/** Narrow screens slide the sidebar over the page instead. */
	let drawer = $state(false);

	onMount(() => {
		try {
			collapsed = localStorage.getItem(remembered) === 'true';
		} catch {
			// Storage can be blocked; the sidebar just starts open.
		}
	});

	afterNavigate(() => (drawer = false));

	function toggle() {
		if (!matchMedia(wide).matches) {
			drawer = !drawer;
			return;
		}
		collapsed = !collapsed;
		try {
			localStorage.setItem(remembered, String(collapsed));
		} catch {
			// Not remembered, then.
		}
	}
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<!-- The player brings its own controls; signing in and choosing a profile stand alone. -->
{#if page.route.id?.startsWith('/series/[id]/watch') || page.route.id === '/login' || page.route.id === '/profiles'}
	{@render children()}
{:else}
	<Header onmenu={toggle} />

	<div class="shell" class:collapsed class:drawer>
		<aside>
			<Sidebar />
		</aside>

		<button class="scrim" aria-label="Close menu" tabindex="-1" onclick={() => (drawer = false)}></button>

		<div class="content">
			{@render children()}
		</div>
	</div>
{/if}

<style>
	.shell {
		--sidebar: 240px;
		display: grid;
		grid-template-columns: var(--sidebar) minmax(0, 1fr);
	}

	aside {
		position: sticky;
		top: 56px;
		height: calc(100vh - 56px);
		overflow-y: auto;
		background: #181818;
		scrollbar-width: thin;
	}

	.content {
		min-width: 0;
	}

	.scrim {
		display: none;
	}

	.collapsed {
		grid-template-columns: minmax(0, 1fr);
	}

	.collapsed aside {
		display: none;
	}

	@media (max-width: 999px) {
		.shell,
		.collapsed {
			grid-template-columns: minmax(0, 1fr);
		}

		aside,
		.collapsed aside {
			position: fixed;
			inset: 56px auto 0 0;
			z-index: 9;
			display: block;
			width: 260px;
			height: auto;
			transform: translateX(-100%);
			visibility: hidden;
			transition:
				transform 200ms,
				visibility 200ms;
		}

		.drawer aside {
			transform: none;
			visibility: visible;
		}

		.drawer .scrim {
			position: fixed;
			inset: 56px 0 0;
			z-index: 8;
			display: block;
			padding: 0;
			border: none;
			background: rgb(0 0 0 / 0.5);
			cursor: default;
		}
	}
</style>
