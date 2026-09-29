<script lang="ts">
	import Button from "$lib/components/ui/Button.svelte";
	import Image from "$lib/components/ui/Image.svelte";
	import Tooltip from "$lib/components/ui/Tooltip.svelte";
	import { tmdbImage, tmdbSrcset } from "$lib/utils";
	import { TrashIcon } from "phosphor-svelte";

	let {
		href,
		image,
		eyebrow,
		title,
		detail,
		footer,
		badge,
		hoverBadge,
		remove,
		onremove,
	}: {
		href: string;
		image: string | null;
		eyebrow?: string;
		title: string;
		detail?: string;
		footer?: string;
		badge?: string;
		hoverBadge?: string;
		remove: string;
		onremove: () => void;
	} = $props();
</script>

<div
	class="group flex h-full flex-col p-2 transition-colors focus-within:bg-surface hover:bg-surface"
>
	<a
		{href}
		class="block focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
	>
		<div class="relative aspect-video overflow-hidden bg-surface">
			{#if image}
				<Image
					src={tmdbImage(image, "w780")}
					srcset={tmdbSrcset(image, { w780: 780, w1280: 1280 })}
					sizes="(min-width: 80rem) 19rem, (min-width: 64rem) 24vw, (min-width: 30em) 48vw, 100vw"
					alt=""
				/>
			{/if}
			{#if badge}
				<span
					class="absolute right-2 bottom-2 bg-black/75 px-1.5 py-0.5 text-xs font-bold text-white"
				>
					{#if hoverBadge}
						<span class="group-focus-within:hidden group-hover:hidden">{badge}</span>
						<span class="hidden group-focus-within:inline group-hover:inline">{hoverBadge}</span>
					{:else}
						{badge}
					{/if}
				</span>
			{/if}
		</div>

		<div class="pt-3">
			{#if eyebrow}
				<p class="text-[0.6875rem] font-semibold tracking-wide text-muted uppercase">
					{eyebrow}
				</p>
			{/if}
			<h3 class={["text-sm leading-snug font-bold", eyebrow && "mt-1.5"]}>
				{title}
			</h3>
			{#if detail}
				<p class="mt-1.5 text-sm text-muted">{detail}</p>
			{/if}
		</div>
	</a>

	<div class="mt-auto flex items-center justify-between gap-3 pt-3">
		<p class="text-sm text-muted">{footer}</p>
		<Tooltip text="Remove">
			{#snippet children(trigger)}
				<Button
					{...trigger}
					class="grid size-8 shrink-0 place-items-center text-muted transition-[color,transform] duration-150 hover:text-status-error active:scale-90"
					aria-label={remove}
					onclick={onremove}
				>
					<TrashIcon size="1.125rem" />
				</Button>
			{/snippet}
		</Tooltip>
	</div>
</div>
