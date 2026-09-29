<script lang="ts">
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
	aria-label={title}
	class="flex flex-col items-center border-2 border-dotted border-muted px-5 py-14 text-center"
>
	<img src={image} {alt} {width} {height} class="w-80" />
	<p class="mt-8 text-muted">{title}</p>
	<p class="text-muted">{hint}</p>
	<a
		href="/"
		class="mt-6 inline-flex min-h-11 items-center bg-accent px-5 text-xs font-bold text-on-accent uppercase hover:brightness-110"
	>
		Go to home feed
	</a>
</section>
