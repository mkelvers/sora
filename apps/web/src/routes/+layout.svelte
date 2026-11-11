<script lang="ts">
	import { onNavigate } from "$app/navigation";
	import favicon from "$lib/assets/favicon.png";
	import { prefersReducedMotion } from "svelte/motion";

	import "./layout.css";

	let { children } = $props();

	onNavigate((navigation) => {
		const samePage = navigation.from?.url.pathname === navigation.to?.url.pathname;
		const historyStep = navigation.type === "popstate";
		if (!document.startViewTransition || prefersReducedMotion.current || samePage || historyStep) {
			return;
		}

		const { promise, resolve } = Promise.withResolvers<undefined>();
		document.startViewTransition(async () => {
			resolve(undefined);
			await navigation.complete;
		});
		return promise;
	});
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<link rel="preconnect" href="https://image.tmdb.org" />
	<meta name="theme-color" content="#000000" />
	<meta property="og:site_name" content="Sora" />
</svelte:head>

{@render children()}
