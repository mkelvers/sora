<script lang="ts">
	import { XIcon } from "phosphor-svelte";
	import type { Snippet } from "svelte";

	import Button from "./Button.svelte";

	let {
		open = $bindable(false),
		id,
		title,
		children,
		footer,
	}: {
		open?: boolean;
		id: string;
		title: string;
		children: Snippet;
		footer?: Snippet;
	} = $props();

	let dialog: HTMLDialogElement;

	$effect(() => {
		if (open && !dialog.open) {
			dialog.showModal();
		} else if (!open && dialog.open) {
			dialog.close();
		}
	});
</script>

<dialog
	bind:this={dialog}
	{id}
	aria-labelledby="{id}-title"
	class="sheet fixed inset-0 m-0 h-dvh max-h-none w-screen max-w-none flex-col overflow-hidden border-0 bg-dropdown p-0 text-foreground shadow-lg open:flex"
	onclose={() => (open = false)}
	{@attach (node) => {
		const desktop = window.matchMedia("(min-width: 640px)");
		const closeOnDesktop = () => {
			if (desktop.matches) node.close();
		};
		desktop.addEventListener("change", closeOnDesktop);
		return () => desktop.removeEventListener("change", closeOnDesktop);
	}}
>
	<div class="flex h-15 shrink-0 items-center justify-between bg-dropdown-hover px-5">
		<h2 id="{id}-title" class="text-base font-normal">{title}</h2>
		<Button
			variant="icon"
			class="text-foreground"
			aria-label="Close"
			onclick={() => (open = false)}
		>
			<XIcon size="1.5rem" weight="bold" />
		</Button>
	</div>
	<div class="min-h-0 flex-1 overflow-y-auto overscroll-contain py-3">
		{@render children()}
	</div>
	{#if footer}
		<div class="shrink-0 p-5">
			{@render footer()}
		</div>
	{/if}
</dialog>

<style>
	.sheet::backdrop {
		background: rgb(0 0 0 / 60%);
	}

	:global(html:has(.sheet[open])) {
		overflow: hidden;
	}
</style>
