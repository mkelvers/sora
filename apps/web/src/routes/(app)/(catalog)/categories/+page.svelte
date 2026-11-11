<script lang="ts">
	import Button from "$lib/components/ui/button.svelte";
	import Tabs from "$lib/components/ui/tabs.svelte";
	import { browseHref } from "$routes/(app)/(catalog)/browse/browse.svelte";

	import type { PageProps } from "./$types";

	let { data }: PageProps = $props();

	const kinds = [
		{
			label: "Genres",
			value: "genres",
		},
		{
			label: "Tags",
			value: "tags",
		},
		{
			label: "Studios",
			value: "studios",
		},
	] as const;

	let kind = $state<(typeof kinds)[number]["value"]>("genres");

	const links = $derived({
		genres: data.genres.map((genre) => ({
			href: browseHref({
				genres: [genre],
			}),
			label: genre,
		})),
		studios: data.studios.map((studio) => ({
			href: browseHref({
				studios: [studio],
			}),
			label: studio,
		})),
		tags: data.tags
			.map((tag) => ({
				href: browseHref({
					tags: [tag.name],
				}),
				label: tag.name,
			}))
			.toSorted((left, right) => left.label.localeCompare(right.label)),
	});
</script>

<svelte:head>
	<title>Anime Categories - Sora</title>
</svelte:head>

<div class="page overflow-x-clip">
	<div class="mx-auto w-full max-w-264">
		<h1 class="mb-8 text-2xl font-bold">Categories</h1>

		<Tabs items={kinds} bind:value={kind} label="Categories" panelClass="pt-6 pb-10">
			{#snippet children(current)}
				<ul class="columns-2 gap-x-4 sm:columns-3 lg:columns-4">
					{#each links[current] as link (link.href)}
						<li class="break-inside-avoid">
							<Button href={link.href} variant="item" class="whitespace-normal">
								{link.label}
							</Button>
						</li>
					{/each}
				</ul>
			{/snippet}
		</Tabs>
	</div>
</div>
