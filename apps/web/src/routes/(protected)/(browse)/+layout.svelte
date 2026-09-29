<script lang="ts">
	import Header from "./_components/Header.svelte";

	let { data, children } = $props();
</script>

{#if data.viewer?.profile}
	<Header profile={data.viewer.profile} profiles={data.viewer.profiles} />
{/if}

<main id="main-content" class="pt-26 sm:pt-14" tabindex="-1">
	{@render children()}
</main>
