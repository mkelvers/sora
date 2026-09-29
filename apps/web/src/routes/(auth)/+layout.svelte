<script lang="ts">
	import type { LayoutProps } from "./$types";

	let { children }: LayoutProps = $props();
</script>

<main
	id="main-content"
	tabindex="-1"
	class="flex min-h-dvh justify-center bg-canvas px-5 pt-34 text-foreground sm:px-10 sm:pt-54"
>
	{@render children()}
</main>
