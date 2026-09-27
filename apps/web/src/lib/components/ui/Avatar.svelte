<script lang="ts" module>
	import { Avatar, Style } from "@dicebear/core";
	import avatar from "@dicebear/styles/sprouts.json";

	const style = new Style(avatar);

	const tops: Record<string, number> = {
		ball: 25.5,
		buds: 28.5,
		bush: 25,
		cactus: 24,
		flower: 11,
		grass: 36,
		palm: 19.5,
		seedling: 12,
		sprout: 26,
		succulent: 34,
		tall: 14,
		tulip: 21,
	};
	const bottom = 109.5;
	const scale = 1;
</script>

<script lang="ts">
	type Props = {
		seed: string;
		class?: string;
	};

	let { seed, class: className }: Props = $props();

	const src = $derived.by(() => {
		const options = {
			seed,
			animationVariant: "fastest",
		} as const;

		const variant = new Avatar(style, options).toJSON().options
			.plantVariant;
		const top = tops[String(variant)] ?? tops.flower;

		return new Avatar(style, {
			...options,
			backgroundColor: [],
			scale,
			translateX: -1.5 * scale,
			translateY: -((top + bottom) / 2 - 50) * scale,
		}).toDataUri();
	});
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
