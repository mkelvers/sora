<script lang="ts">
	import { cn } from "$lib/utils";
	import type { ProfileAvatar } from "@sora/sdk";

	let {
		avatar,
		alt,
		class: className,
	}: {
		avatar: ProfileAvatar;
		alt: string;
		class?: string;
	} = $props();
</script>

<img
	class={cn("block aspect-square w-full object-cover", className)}
	src="/api/avatars/{avatar.style}/{encodeURIComponent(avatar.seed)}.svg"
	{alt}
	draggable="false"
/>
