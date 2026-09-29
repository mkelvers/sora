<script lang="ts">
	import Button from "$lib/components/ui/Button.svelte";

	interface Props {
		image: string;
		alt: string;
		width: number;
		height: number;
		title: string;
		hint: string;
	}

	let { image, alt, width, height, title, hint }: Props = $props();
</script>

<section
	class="flex flex-col items-center border-2 border-dotted border-muted px-5 py-14 text-center"
>
	<img src={image} {alt} {width} {height} class="w-80" />
	<p class="mt-8 text-muted">{title}</p>
	<p class="text-muted">{hint}</p>
	<Button href="/" variant="primary" class="mt-6">Go to home feed</Button>
</section>
