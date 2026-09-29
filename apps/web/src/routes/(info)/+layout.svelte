<script lang="ts">
	import logo from "$lib/assets/logo.png";
	import Footer from "$lib/components/Footer.svelte";

	import type { LayoutProps } from "./$types";

	let { children }: LayoutProps = $props();
</script>

<header class="flex h-14 items-center bg-header">
	<a href="/" class="inline-flex h-full items-center px-1 sm:px-3" aria-label="Home">
		<img src={logo} alt="Sora logo" class="size-11" />
	</a>
</header>

<main id="main-content" tabindex="-1" class="bg-canvas text-foreground">
	{@render children()}
</main>

<Footer />
