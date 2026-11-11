<script lang="ts">
	import Button from "$lib/components/ui/button.svelte";
	import { browseHref, tagGroups } from "$routes/(app)/(catalog)/browse/browse.svelte";

	import type { PageProps } from "./$types";

	let { data }: PageProps = $props();

	const groups = $derived([
		{
			id: "genre",
			label: "Genres",
			sections: [
				[
					undefined,
					data.genres.map((genre) => ({
						href: browseHref({
							genres: [genre],
						}),
						label: genre,
					})),
				] as const,
			],
		},
		...tagGroups.map((group) => ({
			id: group.value,
			label: group.label,
			sections: [
				...Map.groupBy(
					data.tags.filter((tag) => tag.group === group.value),
					(tag) => (group.value === "demographic" ? undefined : tag.section),
				),
			].map(
				([section, tags]) =>
					[
						section,
						tags.map((tag) => ({
							href: browseHref({
								tags: [tag.name],
							}),
							label: tag.name,
						})),
					] as const,
			),
		})),
	]);
</script>

<svelte:head>
	<title>Anime Categories - Sora</title>
</svelte:head>

<div class="page overflow-x-clip">
	<div class="mx-auto w-full max-w-264">
		<h1 class="mb-8 text-2xl font-bold">Categories</h1>

		{#each groups as group (group.id)}
			<section class="mb-12" aria-labelledby="categories-{group.id}">
				<h2 id="categories-{group.id}" class="mb-4 text-lg font-bold">{group.label}</h2>
				{#each group.sections as [section, links] (section ?? group.id)}
					{#if section}
						<h3 class="mt-4 mb-1 text-sm text-subtle">{section}</h3>
					{/if}
					<ul class="-mx-2 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
						{#each links as link (link.href)}
							<li>
								<Button href={link.href} variant="item" size="sm">{link.label}</Button>
							</li>
						{/each}
					</ul>
				{/each}
			</section>
		{/each}
	</div>
</div>
