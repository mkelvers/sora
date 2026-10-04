<script lang="ts">
	import { cn } from "$lib/utils";
	import type { ProfileAvatar } from "@sora/sdk";

	type Props = {
		avatar: ProfileAvatar;
		alt: string;
		class?: string;
	};

	let { avatar, alt, class: className }: Props = $props();
</script>

<img
	class={cn("block aspect-square w-full object-cover", className)}
	src="/api/avatars/{avatar.style}/{encodeURIComponent(avatar.seed)}.svg"
	{alt}
	draggable="false"
/>
