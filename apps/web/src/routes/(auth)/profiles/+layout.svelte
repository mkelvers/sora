<script lang="ts">
	import { onDestroy } from "svelte";

	import type { LayoutProps } from "./$types";
	import { profilesPage } from "./profiles.svelte";

	let { children }: LayoutProps = $props();

	onDestroy(() => {
		profilesPage.managing = false;
	});
</script>

<main
	id="main-content"
	tabindex="-1"
	class="flex min-h-dvh items-center justify-center bg-canvas px-5 py-16 text-foreground sm:px-10"
>
	{@render children()}
</main>
