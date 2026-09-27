<script lang="ts">
	import { cn } from '$lib/utils';

	let {
		rating,
		class: className,
	}: {
		rating: string;
		class?: string;
	} = $props();

	const ages: Record<
		string,
		{
			label: string;
			description: string;
		}
	> = {
		'G': {
			label: 'ALL',
			description: 'Suitable for all ages',
		},
		'TV-Y': {
			label: 'ALL',
			description: 'Suitable for all ages',
		},
		'TV-G': {
			label: 'ALL',
			description: 'Suitable for all ages',
		},
		'TV-Y7': {
			label: '7+',
			description: 'Not recommended for children under seven',
		},
		'PG': {
			label: '10+',
			description: 'Not recommended for children under ten',
		},
		'TV-PG': {
			label: '10+',
			description: 'Not recommended for children under ten',
		},
		'PG-13': {
			label: '13+',
			description: 'Not recommended for minors under thirteen',
		},
		'TV-14': {
			label: '14+',
			description: 'Not recommended for minors under fourteen',
		},
		'R': {
			label: '17+',
			description: 'Not recommended for minors under seventeen',
		},
		'TV-MA': {
			label: '18+',
			description: 'For adults only',
		},
		'NC-17': {
			label: '18+',
			description: 'For adults only',
		},
	};

	const age = $derived(ages[rating]);
</script>

{#if age}
	<svg
		class={cn('inline-block h-[1.25em] w-auto shrink-0 align-middle', className)}
		viewBox="0 0 37 20"
		role="img"
		aria-label={age.description}
	>
		<path d="M3.304 1.646A2 2 0 0 1 5.272 0H6v20H2.392a2 2 0 0 1-1.968-2.354z" fill="#4A4E58" fill-opacity="0.7" />
		<rect x="6" width="25" height="20" fill="#4A4E58" fill-opacity="0.7" />
		<path d="M33.696 18.354A2 2 0 0 1 31.728 20H31V0h3.608a2 2 0 0 1 1.968 2.354z" fill="#4A4E58" fill-opacity="0.7" />
		<text
			x="18.5"
			y="14.4"
			fill="#DADADA"
			font-size="11"
			font-style="italic"
			font-weight="600"
			text-anchor="middle"
			letter-spacing="0.2"
		>
			{age.label}
		</text>
	</svg>
{/if}
