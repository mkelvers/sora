<script lang="ts">
	import type { LayoutProps } from "./$types";

	let { children }: LayoutProps = $props();
</script>

<div class="flex min-h-dvh flex-col bg-canvas text-foreground">
	<main
		id="main-content"
		tabindex="-1"
		class="flex flex-1 justify-center px-5 pt-34 sm:px-10 sm:pt-54"
	>
		{@render children()}
	</main>
</div>
