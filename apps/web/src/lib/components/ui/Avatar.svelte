<script lang="ts" module>
	import { cn } from "$lib/utils";
	import { Avatar, Style } from "@dicebear/core";
	import crittersDefinition from "@dicebear/styles/critters.json";
	import sproutsDefinition from "@dicebear/styles/sprouts.json";
	import type { ProfileAvatar } from "@sora/sdk";

	const sprouts = new Style(sproutsDefinition);
	const critters = new Style(crittersDefinition);

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
		avatar: ProfileAvatar;
		class?: string;
	};

	let { avatar, class: className }: Props = $props();

	const src = $derived.by(() => {
		const options = {
			seed: avatar.seed,
			animationVariant: "fastest",
		} as const;

		if (avatar.style === "critters") {
			return new Avatar(critters, {
				...options,
				backgroundColor: [],
			}).toDataUri();
		}

		const variant = new Avatar(sprouts, options).toJSON().options.plantVariant;
		const top = tops[String(variant)] ?? tops.flower;

		return new Avatar(sprouts, {
			...options,
			backgroundColor: [],
			scale,
			translateX: -1.5 * scale,
			translateY: -((top + bottom) / 2 - 50) * scale,
		}).toDataUri();
	});
</script>

<img
	class={cn("block aspect-square w-full object-cover", className)}
	{src}
	alt=""
	draggable="false"
/>
