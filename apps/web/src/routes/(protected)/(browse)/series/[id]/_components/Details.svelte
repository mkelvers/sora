<script lang="ts">
	import type { Series } from "@sora/sdk";

	let {
		series,
	}: {
		series: Series;
	} = $props();
</script>

<div class="relative z-20 bg-canvas px-5 py-7 sm:px-10 lg:px-16 lg:py-8">
	<section aria-label="Synopsis" class="text-xs leading-5 text-foreground lg:text-sm lg:leading-6">
		{#if series.overview}
			<p class="max-w-3xl">{series.overview}</p>
		{/if}
	</section>
</div>
