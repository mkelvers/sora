<script lang="ts">
	import type { Snippet } from "svelte";

	let {
		title,
		description,
		children,
	}: {
		title: string;
		description: string;
		children: Snippet;
	} = $props();

	const id = $props.id();
</script>

<section class="md:bg-raised md:px-12 md:py-20" aria-labelledby="{id}-title">
	<div class="mx-auto max-w-lg">
		<h2 id="{id}-title" class="text-xl font-bold md:text-center md:text-2xl">{title}</h2>
		<p class="mt-2 text-sm leading-relaxed text-muted md:mt-3 md:text-center">{description}</p>

		<div class="mt-10 space-y-12 md:mt-12 md:space-y-8">
			{@render children()}
		</div>
	</div>
</section>
