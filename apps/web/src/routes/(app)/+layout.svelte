<script lang="ts">
	import { invalidate } from "$app/navigation";
	import { navigating } from "$app/state";
	import EmptyState from "$lib/components/empty-state.svelte";
	import { mascots } from "$lib/mascots";
	import { attempt } from "@sora/shared";
	import { untrack } from "svelte";

	import Header from "./components/header.svelte";
	import { Library, setLibrary } from "./library.svelte";
	import { setTimeZone } from "./time-zone.remote";

	let { data, children } = $props();

	setLibrary(new Library());

	$effect(() => {
		const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
		if (data.timeZone !== zone) {
			untrack(() => {
				attempt(setTimeZone(zone).then(() => invalidate("sora:time-zone")));
			});
		}
	});
</script>

{#if navigating.to}
	<div class="navigation-progress" role="progressbar" aria-label="Loading page"></div>
{/if}

<Header profile={data.viewer.profile} profiles={data.viewer.profiles} />

<main id="main-content" class="pt-26 sm:pt-14" tabindex="-1">
	<svelte:boundary>
		{@render children()}

		{#snippet failed()}
			<section class="page" aria-labelledby="page-failed">
				<div class="mx-auto max-w-7xl">
					<h1 id="page-failed" class="mb-8 text-2xl font-bold">This page couldn't be loaded</h1>
					<EmptyState
						mascot={mascots.lost}
						title="Something got in the way."
						hint="Give it a moment and try again."
					/>
				</div>
			</section>
		{/snippet}
	</svelte:boundary>
</main>

<style>
	.navigation-progress {
		position: fixed;
		inset: 0 0 auto 0;
		z-index: 60;
		height: 2px;
		overflow: hidden;
		background: color-mix(in srgb, var(--color-accent) 25%, transparent);
		opacity: 0;
		animation: navigation-progress-in 0s linear 150ms forwards;
	}

	.navigation-progress::after {
		content: "";
		position: absolute;
		inset: 0;
		width: 40%;
		background: var(--color-accent);
		animation: navigation-progress-run 1.1s ease-in-out infinite;
	}

	@keyframes navigation-progress-in {
		to {
			opacity: 1;
		}
	}

	@keyframes navigation-progress-run {
		from {
			transform: translateX(-100%);
		}

		to {
			transform: translateX(250%);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.navigation-progress::after {
			width: 100%;
			animation: none;
		}
	}
</style>
