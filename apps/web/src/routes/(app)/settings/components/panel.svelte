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

<section class="bg-raised px-6 py-10 sm:px-12 sm:py-14" aria-labelledby="{id}-title">
	<h2 id="{id}-title" class="text-xl font-bold">{title}</h2>
	<p class="mt-2 max-w-lg text-sm leading-relaxed text-muted">{description}</p>

	<div class="mt-10 max-w-2xl space-y-8">
		{@render children()}
	</div>
</section>
