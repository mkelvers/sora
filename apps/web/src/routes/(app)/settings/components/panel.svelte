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

<section class="bg-raised px-6 py-14 sm:px-12 sm:py-20" aria-labelledby="{id}-title">
	<div class="mx-auto max-w-lg">
		<h2 id="{id}-title" class="text-center text-2xl font-bold">{title}</h2>
		<p class="mt-3 text-center text-sm text-muted">{description}</p>

		<div class="mt-12 space-y-8">
			{@render children()}
		</div>
	</div>
</section>
