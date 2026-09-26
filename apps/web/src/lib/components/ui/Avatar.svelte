<script lang="ts" module>
	import { Avatar, Style } from "@dicebear/core";
	import critters from "@dicebear/styles/critters.json";

	const style = new Style(critters);
</script>

<script lang="ts">
	type Props = {
		seed: string;
		class?: string;
	};

	let { seed, class: className }: Props = $props();

	const src = $derived(
		new Avatar(style, {
			seed,
			animationVariant: "fastest",
		}).toDataUri(),
	);
</script>

<img class={["avatar", className]} {src} alt="" draggable="false" />

<style>
	.avatar {
		display: block;
		width: 100%;
		aspect-ratio: 1;
		object-fit: cover;
	}
</style>
