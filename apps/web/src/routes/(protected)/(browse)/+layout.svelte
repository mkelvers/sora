<script lang="ts">
	import lost from "$lib/assets/illustrations/lost.webp";
	import EmptyState from "$lib/components/EmptyState.svelte";
	import Button from "$lib/components/ui/Button.svelte";

	import Header from "./_components/Header.svelte";

	let { data, children } = $props();
</script>

{#if data.viewer?.profile}
	<Header profile={data.viewer.profile} profiles={data.viewer.profiles} />
{/if}

<main id="main-content" class="pt-26 sm:pt-14" tabindex="-1">
	<svelte:boundary>
		{@render children()}

		{#snippet failed(_, reset)}
			<section
				class="grid min-h-[calc(100dvh-6.5rem)] place-items-center bg-canvas px-5 py-10 text-foreground sm:min-h-[calc(100dvh-3.5rem)]"
				aria-labelledby="page-failed"
			>
				<div class="flex w-full max-w-5xl flex-col items-center">
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
					<Button variant="outline" class="mt-6" onclick={reset}>Try again</Button>
				</div>
			</section>
		{/snippet}
	</svelte:boundary>
</main>
