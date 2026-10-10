<script lang="ts">
	import Button from "$lib/components/ui/Button.svelte";
	import type { Mascot } from "$lib/mascots";
	import { cn } from "$lib/utils";

	let {
		mascot,
		title,
		hint,
		class: className,
	}: {
		mascot: Mascot;
		title: string;
		hint: string;
		class?: string;
	} = $props();
</script>

<section
	class={cn(
		"flex flex-col items-center border-2 border-dotted border-muted px-5 py-14 text-center",
		className,
	)}
>
	<img
		src={mascot.src}
		alt={mascot.alt}
		width={mascot.width}
		height={mascot.height}
		loading="lazy"
		decoding="async"
		class="w-72"
	/>
	<p class="mt-8 font-bold">{title}</p>
	<p class="mt-1 text-sm text-muted">{hint}</p>
	<Button href="/" variant="secondary" class="mt-8">Go to Home Feed</Button>
</section>
