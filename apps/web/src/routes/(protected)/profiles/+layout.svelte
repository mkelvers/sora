<script lang="ts">
	import { onDestroy } from "svelte";

	import type { LayoutProps } from "./$types";
	import { profilesPage } from "./profiles.svelte";

	let { children }: LayoutProps = $props();

	onDestroy(() => {
		profilesPage.managing = false;
	});
</script>

<div class="flex min-h-dvh flex-col bg-canvas text-foreground">
	<main
		id="main-content"
		tabindex="-1"
		class="flex flex-1 items-center justify-center px-5 py-16 sm:px-10"
	>
		{@render children()}
	</main>
</div>
