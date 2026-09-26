<script lang="ts">
	import { page } from '$app/state';
	import Icon, { type IconName } from '$lib/components/ui/Icon.svelte';
	import { animeSeason } from '$lib/utils';

	type Link = {
		label: string;
		href: string;
		icon: IconName;
	};

	const season = animeSeason(new Date());

	const sections: { title?: string; links: Link[] }[] = [
		{
			links: [{ label: 'Home', href: '/', icon: 'home' }]
		},
		{
			title: 'Discover',
			links: [
				{ label: 'Trending', href: '/browse?sort=trending', icon: 'trending' },
				{ label: 'Popular', href: '/browse?sort=popular', icon: 'popular' },
				{
					label: 'Simulcast',
					href: `/browse?season=${season.season}&season_year=${season.year}&sort=popular`,
					icon: 'live'
				},
				{ label: 'Release calendar', href: '/schedule', icon: 'calendar' },
				{ label: 'Genres', href: '/genres', icon: 'category' }
			]
		}
	];

	function active(href: string) {
		const url = new URL(href, page.url);
		return url.search ? `${page.url.pathname}${page.url.search}` === href : page.url.pathname === url.pathname;
	}
</script>

<nav aria-label="Main">
	{#each sections as section, index (index)}
		<div class="section">
			{#if section.title}
				<h2>{section.title}</h2>
			{/if}

			{#each section.links as link (link.href)}
				<a href={link.href} aria-current={active(link.href) ? 'page' : undefined}>
					<Icon name={link.icon} />
					{link.label}
				</a>
			{/each}
		</div>
	{/each}
</nav>

<style>
	nav {
		display: flex;
		flex-direction: column;
		gap: 16px;
		padding: 12px 0;
	}

	.section {
		display: flex;
		flex-direction: column;
	}

	h2 {
		margin: 0;
		padding: 8px 24px;
		color: #888;
		font-size: 13px;
		font-weight: 500;
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}

	a {
		display: flex;
		align-items: center;
		gap: 20px;
		padding: 10px 24px;
		color: #ccc;
		font-size: 15px;
		text-decoration: none;
		transition:
			background 120ms,
			color 120ms;
	}

	a :global(svg) {
		color: #999;
	}

	a:hover {
		background: rgb(255 255 255 / 0.06);
		color: #fff;
	}

	a[aria-current='page'] {
		background: rgb(255 255 255 / 0.1);
		color: #fff;
	}

	a[aria-current='page'] :global(svg) {
		color: #fff;
	}

	a:focus-visible {
		outline: 2px solid #fff;
		outline-offset: -2px;
	}
</style>
