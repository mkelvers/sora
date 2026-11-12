<script lang="ts">
	import Button from "$lib/components/ui/button.svelte";
	import { browseHref } from "$routes/(app)/(catalog)/browse/browse.svelte";

	import type { PageProps } from "./$types";

	let { data }: PageProps = $props();

	const sections = $derived([
		{
			id: "genres",
			label: "Genres",
			links: data.genres.map((genre) => ({
				href: browseHref({
					genres: [genre],
				}),
				label: genre,
			})),
		},
		{
			id: "tags",
			label: "Tags",
			links: data.tags
				.map((tag) => ({
					href: browseHref({
						tags: [tag.name],
					}),
					label: tag.name,
				}))
				.toSorted((left, right) => left.label.localeCompare(right.label)),
		},
		{
			id: "studios",
			label: "Studios",
			links: data.studios.map((studio) => ({
				href: browseHref({
					studios: [studio],
				}),
				label: studio,
			})),
		},
	]);
</script>

<svelte:head>
	<title>Anime Categories - Sora</title>
</svelte:head>

<div class="page overflow-x-clip">
	<div class="mx-auto w-full max-w-264">
		<h1 class="mb-8 text-2xl font-bold">Categories</h1>

		{#each sections as section (section.id)}
			<section class="mb-12" aria-labelledby="categories-{section.id}">
				<h2 id="categories-{section.id}" class="mb-4 text-lg font-bold">{section.label}</h2>
				<ul class="-mx-2 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
					{#each section.links as link (link.href)}
						<li>
							<Button href={link.href} variant="item" size="sm" class="whitespace-normal">
								{link.label}
							</Button>
						</li>
					{/each}
				</ul>
			</section>
		{/each}
	</div>
</div>
