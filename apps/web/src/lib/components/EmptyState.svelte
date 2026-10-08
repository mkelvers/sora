<script lang="ts">
	import Button from "$lib/components/ui/Button.svelte";
	import type { Mascot } from "$lib/mascots";

	let {
		mascot,
		title,
		hint,
	}: {
		mascot: Mascot;
		title: string;
		hint: string;
	} = $props();
</script>

<section
	class="flex flex-col items-center border-2 border-dotted border-muted px-5 py-14 text-center"
>
	<img src={mascot.src} alt={mascot.alt} width={mascot.width} height={mascot.height} class="w-72" />
	<p class="mt-8 font-bold">{title}</p>
	<p class="mt-1 text-sm text-muted">{hint}</p>
	<Button href="/" variant="secondary" class="mt-8">Go to home feed</Button>
</section>
