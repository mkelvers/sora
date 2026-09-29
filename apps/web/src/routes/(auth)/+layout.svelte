<script lang="ts">
	import Footer from "$lib/components/Footer.svelte";

	import type { LayoutProps } from "./$types";

	let { children }: LayoutProps = $props();
</script>

<main
	id="main-content"
	tabindex="-1"
	class="grid min-h-dvh place-items-center bg-canvas px-5 py-16 text-foreground sm:px-10"
>
	{@render children()}
</main>

<Footer />
