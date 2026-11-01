<script lang="ts">
	import Button from "$lib/components/ui/button.svelte";
	import { cn } from "$lib/utils";
	import { XIcon } from "phosphor-svelte";
	import { prefersReducedMotion } from "svelte/motion";
	import { fly } from "svelte/transition";

	let {
		message,
		tone = "success",
		action,
		ondismiss,
	}: {
		message: string;
		tone?: "error" | "success";
		action?: {
			label: string;
			onclick: () => void;
		};
		ondismiss?: () => void;
	} = $props();

	const lingerMs = 4000;
	const lingerWithActionMs = 10_000;

	$effect(() => {
		if (!message || tone === "error") {
			return;
		}
		const timeout = setTimeout(() => ondismiss?.(), action ? lingerWithActionMs : lingerMs);
		return () => clearTimeout(timeout);
	});
</script>

{#if message}
	<div
		class={cn(
			"fixed inset-x-0 top-0 z-100 grid min-h-10 place-items-center px-14 py-2 text-sm text-on-status",
			tone === "error" ? "bg-danger" : "bg-success",
		)}
		out:fly={{
			y: prefersReducedMotion.current ? 0 : -40,
			duration: prefersReducedMotion.current ? 120 : 180,
		}}
		role={tone === "error" ? "alert" : "status"}
		aria-live={tone === "error" ? "assertive" : "polite"}
		aria-atomic="true"
	>
		<p class="text-center">
			{message}
			{#if action}
				<button
					type="button"
					class="ml-1 cursor-pointer underline underline-offset-2 opacity-80 transition-opacity duration-150 outline-none hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-on-status"
					onclick={action.onclick}
				>
					{action.label}
				</button>
			{/if}
		</p>
		<Button
			variant="icon"
			class="absolute inset-y-0 right-0 h-auto w-12 text-current hover:bg-black/10 hover:text-current focus-visible:-outline-offset-2 focus-visible:outline-on-status"
			aria-label="Dismiss"
			onclick={ondismiss}
		>
			<XIcon size={18} aria-hidden="true" />
		</Button>
	</div>
{/if}
