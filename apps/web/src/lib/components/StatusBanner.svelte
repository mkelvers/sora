<script lang="ts">
	import Button from "$lib/components/ui/Button.svelte";
	import { cn } from "$lib/utils";
	import { XIcon } from "phosphor-svelte";
	import { prefersReducedMotion } from "svelte/motion";
	import { fly } from "svelte/transition";

	interface Props {
		message: string;
		tone?: "error" | "success";
		ondismiss?: () => void;
	}

	let { message, tone = "success", ondismiss }: Props = $props();

	$effect(() => {
		if (!message || tone === "error") {
			return;
		}
		const timeout = setTimeout(() => ondismiss?.(), 4_000);
		return () => clearTimeout(timeout);
	});
</script>

{#if message}
	<div
		class={cn(
			"fixed inset-x-0 top-0 z-100 grid min-h-12 place-items-center px-14 py-2 text-sm font-semibold text-on-status",
			tone === "error" ? "bg-danger" : "bg-success",
		)}
		out:fly={{
			y: prefersReducedMotion.current ? 0 : -48,
			duration: prefersReducedMotion.current ? 120 : 180,
		}}
		role={tone === "error" ? "alert" : "status"}
		aria-live={tone === "error" ? "assertive" : "polite"}
		aria-atomic="true"
	>
		<p class="text-center">{message}</p>
		<Button
			variant="icon"
			class="absolute inset-y-0 right-0 h-auto w-12 text-current hover:bg-black/10 hover:text-current focus-visible:-outline-offset-2 focus-visible:outline-on-status"
			aria-label="Dismiss"
			onclick={ondismiss}
		>
			<XIcon size={20} weight="bold" aria-hidden="true" />
		</Button>
	</div>
{/if}
