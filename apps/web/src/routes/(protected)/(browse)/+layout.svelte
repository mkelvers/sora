<script lang="ts">
	import { invalidate } from "$app/navigation";
	import lost from "$lib/assets/illustrations/lost.webp";
	import EmptyState from "$lib/components/EmptyState.svelte";
	import { timeZoneCookie } from "$lib/utils";

	import Header from "./_components/Header.svelte";

	let { data, children } = $props();

	$effect(() => {
		const zone = encodeURIComponent(Intl.DateTimeFormat().resolvedOptions().timeZone);
		if (!document.cookie.split("; ").includes(`${timeZoneCookie}=${zone}`)) {
			document.cookie = `${timeZoneCookie}=${zone}; path=/; max-age=31536000; samesite=lax`;
			invalidate("sora:time-zone");
		}
	});
</script>

{#if data.viewer?.profile}
	<Header profile={data.viewer.profile} profiles={data.viewer.profiles} />
{/if}

<main id="main-content" class="pt-26 sm:pt-14" tabindex="-1">
	<svelte:boundary>
		{@render children()}

		{#snippet failed()}
			<section
				class="grid min-h-[calc(100dvh-6.5rem)] place-items-center bg-canvas px-5 py-10 text-foreground sm:min-h-[calc(100dvh-3.5rem)]"
				aria-labelledby="page-failed"
			>
				<div class="w-full max-w-5xl">
					<h1 id="page-failed" class="mb-8 text-center text-2xl font-bold">
						Well, that didn't go as planned
					</h1>
					<EmptyState
						image={lost}
						alt="Sora's mascot, lost and confused, holding a map upside down"
						width={701}
						height={720}
						title="This page couldn't be loaded."
						hint="Give it a moment and try again."
					/>
				</div>
			</section>
		{/snippet}
	</svelte:boundary>
</main>
