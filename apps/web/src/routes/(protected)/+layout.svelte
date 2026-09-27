<script lang="ts">
	import { page } from "$app/state";
	import Header from "./_components/Header.svelte";

	let { data, children } = $props();

	const bare = $derived(
		page.route.id?.startsWith("/(protected)/profiles") ||
			page.route.id?.includes("/watch/"),
	);
</script>

{#if data.viewer.profile && !bare}
	<Header profile={data.viewer.profile} profiles={data.viewer.profiles} />
{/if}

{@render children()}
