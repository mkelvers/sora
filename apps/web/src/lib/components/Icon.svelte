<script lang="ts" module>
	import { cva, type VariantProps } from 'class-variance-authority';

	const paths = {
		info: 'M11 7h2v2h-2zm0 4h2v6h-2zm1-9C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z',
		expand: 'M7 10l5 5 5-5z',
		check: 'M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z',
		heart:
			'M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z',
		more: 'M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z',
		edit: 'M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a.996.996 0 0 0 0-1.41l-2.34-2.34a.996.996 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z',
		back: 'M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z',
		restore:
			'M13 3a9 9 0 0 0-9 9H1l3.89 3.89.07.14L9 12H6c0-3.87 3.13-7 7-7s7 3.13 7 7-3.13 7-7 7c-1.93 0-3.68-.79-4.94-2.06l-1.42 1.42A8.954 8.954 0 0 0 13 21a9 9 0 0 0 0-18z',
		play: 'M8 5v14l11-7z',
		pause: 'M6 19h4V5H6v14zm8-14v14h4V5h-4z',
		rewind: 'M11 18V6l-8.5 6 8.5 6zm.5-6 8.5 6V6l-8.5 6z',
		forward: 'M4 18l8.5-6L4 6v12zm9-12v12l8.5-6L13 6z',
		previous: 'M6 6h2v12H6zm3.5 6 8.5 6V6z',
		next: 'M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z',
		volume:
			'M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z',
		muted:
			'M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3 3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4 9.91 6.09 12 8.18V4z',
		fullscreen: 'M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z',
		'exit-fullscreen': 'M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z'
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
