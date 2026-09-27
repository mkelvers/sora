<script lang="ts">
	import Header from './_components/Header.svelte';

	let {
		data,
		children,
	} = $props();
</script>

{#if data.viewer.profile}
	<Header profile={data.viewer.profile} profiles={data.viewer.profiles} />
{/if}

<div id="main-content" class="pt-14" tabindex="-1">
	{@render children()}
</div>
