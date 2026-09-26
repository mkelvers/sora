<script lang="ts" module>
	import { cva, type VariantProps } from 'class-variance-authority';

	const skeleton = cva('skeleton', {
		variants: {
			variant: {
				block: '',
				text: 'text'
			}
		},
		defaultVariants: {
			variant: 'block'
		}
	});
</script>

<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';

	type Props = HTMLAttributes<HTMLElement> &
		VariantProps<typeof skeleton> & {
			as?: keyof HTMLElementTagNameMap;
			width?: string;
			height?: string;
			ratio?: string;
		};

	let { as = 'div', class: className, variant, width, height, ratio, ...props }: Props = $props();
</script>

<svelte:element
	this={as}
	class={[skeleton({ variant }), className]}
	style:width
	style:height
	style:aspect-ratio={ratio}
	aria-hidden="true"
	{...props}
></svelte:element>

<style>
	/* Layered so a caller's own styles always win, whatever their specificity. */
	@layer skeleton {
		.skeleton {
			display: block;
			background: linear-gradient(90deg, #1f1f1f 0%, #2c2c2c 50%, #1f1f1f 100%);
			background-size: 200% 100%;
			animation: shimmer 1.2s linear infinite;
		}

		.text {
			height: 12px;
		}

		@media (prefers-reduced-motion: reduce) {
			.skeleton {
				animation: none;
			}
		}
	}

	@keyframes shimmer {
		from {
			background-position: 200% 0;
		}
		to {
			background-position: -200% 0;
		}
	}
</style>
