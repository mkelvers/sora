<script lang="ts" module>
	import { cva, type VariantProps } from 'class-variance-authority';

	const button = cva('button', {
		variants: {
			variant: {
				default: '',
				ghost: 'ghost'
			}
		},
		defaultVariants: {
			variant: 'default'
		}
	});
</script>

<script lang="ts">
	import type { HTMLButtonAttributes } from 'svelte/elements';

	type Props = HTMLButtonAttributes & VariantProps<typeof button>;

	let { class: className, type = 'button', variant, children, ...props }: Props = $props();
</script>

<button class={[button({ variant }), className]} {type} {...props}>
	{@render children?.()}
</button>

<style>
	/* Layered so a caller's own styles always win, whatever their specificity. */
	@layer button {
		.button {
			display: inline-flex;
			flex-shrink: 0;
			align-items: center;
			justify-content: center;
			gap: 8px;
			padding: 0;
			border: none;
			background: none;
			color: inherit;
			font: inherit;
			font-size: 14px;
			white-space: nowrap;
			cursor: pointer;
			outline: none;
			user-select: none;
			transition:
				background-color 120ms,
				color 120ms;
		}

		.button:focus-visible {
			outline: 2px solid #fff;
			outline-offset: 2px;
		}

		.button:disabled,
		.button[aria-disabled='true'] {
			opacity: 0.5;
			cursor: not-allowed;
			pointer-events: none;
		}

		.button :global(svg) {
			flex-shrink: 0;
			pointer-events: none;
		}

		.ghost:hover {
			background: rgb(255 255 255 / 0.08);
		}
	}
</style>
