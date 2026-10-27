<script lang="ts">
	import { invalidate } from "$app/navigation";
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
