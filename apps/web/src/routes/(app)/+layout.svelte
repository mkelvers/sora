<script lang="ts">
	import { invalidate } from "$app/navigation";
	import EmptyState from "$lib/components/EmptyState.svelte";
	import { mascots } from "$lib/mascots";

	import Header from "./components/Header.svelte";
	import { Library, setLibrary } from "./library.svelte";

	let { data, children } = $props();

	setLibrary(new Library());

	$effect(() => {
		const zone = encodeURIComponent(Intl.DateTimeFormat().resolvedOptions().timeZone);
		if (!document.cookie.split("; ").includes(`sora_tz=${zone}`)) {
			document.cookie = `sora_tz=${zone}; path=/; max-age=31536000; samesite=lax`;
			invalidate("sora:time-zone");
		}
	});
</script>

<Header profile={data.viewer.profile} profiles={data.viewer.profiles} />

<main id="main-content" class="pt-26 sm:pt-14" tabindex="-1">
	<svelte:boundary>
		{@render children()}

		{#snippet failed()}
			<section class="grid page place-items-center" aria-labelledby="page-failed">
				<h1 id="page-failed" class="sr-only">This page couldn't be loaded</h1>
				<EmptyState
					mascot={mascots.lost}
					title="This page couldn't be loaded."
					hint="Give it a moment and try again."
				/>
			</section>
		{/snippet}
	</svelte:boundary>
</main>
