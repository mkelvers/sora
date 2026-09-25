<script lang="ts" module>
	import { cva, type VariantProps } from 'class-variance-authority';

	const paths = {
		info: 'M11 7h2v2h-2zm0 4h2v6h-2zm1-9C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z',
		check: 'M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z',
		heart:
			'M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z',
		more: 'M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z',
		edit: 'M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a.996.996 0 0 0 0-1.41l-2.34-2.34a.996.996 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z',
		back: 'M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z'
	};

	const icon = cva('icon', {
		variants: {
			size: {
				xs: 'xs',
				sm: 'sm',
				md: 'md',
				lg: 'lg'
			}
		},
		defaultVariants: {
			size: 'lg'
		}
	});

	export type IconName = keyof typeof paths;
</script>

<script lang="ts">
	type Props = VariantProps<typeof icon> & {
		name: IconName;
	};

	let { name, size }: Props = $props();
</script>

<svg class={icon({ size })} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
	<path d={paths[name]} />
</svg>

<style>
	.icon {
		flex: none;
	}

	.xs {
		width: 12px;
		height: 12px;
	}

	.sm {
		width: 16px;
		height: 16px;
	}

	.md {
		width: 20px;
		height: 20px;
	}

	.lg {
		width: 24px;
		height: 24px;
	}
</style>
