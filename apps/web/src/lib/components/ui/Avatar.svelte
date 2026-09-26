<script lang="ts" module>
	import { Avatar, Style } from '@dicebear/core';
	import thumbs from '@dicebear/styles/thumbs.json';

	// Thumbs, by Florian Körner, is CC0: free to use without credit.
	const style = new Style(thumbs);
</script>

<script lang="ts">
	type Props = {
		/** A DiceBear seed, such as a profile's `avatar`. */
		seed: string;
		class?: string;
	};

	let { seed, class: className }: Props = $props();

	const src = $derived(new Avatar(style, { seed }).toDataUri());
</script>

<img class={['avatar', className]} {src} alt="" draggable="false" />

<style>
	.avatar {
		display: block;
		width: 100%;
		aspect-ratio: 1;
		object-fit: cover;
	}
</style>
