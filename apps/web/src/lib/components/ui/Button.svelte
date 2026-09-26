<script lang="ts" module>
	import { cva, type VariantProps } from 'class-variance-authority';

	const button = cva('button', {
		variants: {
			variant: {
				default: '',
				ghost: 'ghost',
				primary: 'solid primary',
				secondary: 'solid secondary'
			}
		},
		defaultVariants: {
			variant: 'default'
		}
	});
</script>

<script lang="ts">
	import type { HTMLAnchorAttributes, HTMLButtonAttributes } from 'svelte/elements';

	type Props = VariantProps<typeof button> &
		((HTMLButtonAttributes & { href?: undefined }) | (HTMLAnchorAttributes & { href: string }));

	let { class: className, variant, children, ...props }: Props = $props();
</script>

{#if props.href !== undefined}
	<a class={[button({ variant }), className]} {...props as HTMLAnchorAttributes}>
		{@render children?.()}
	</a>
{:else}
	<button
		class={[button({ variant }), className]}
		{...props as HTMLButtonAttributes}
		type={(props as HTMLButtonAttributes).type ?? 'button'}
	>
		{@render children?.()}
	</button>
{/if}

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
			text-decoration: none;
			cursor: pointer;
			outline: none;
			user-select: none;
			transition:
				background-color 160ms var(--ease),
				color 160ms var(--ease),
				transform 160ms var(--ease);
		}

		.button:focus-visible {
			outline: 2px solid var(--text);
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

		.solid {
			height: 48px;
			padding: 0 24px;
			border-radius: 8px;
			font-size: 15px;
			font-weight: 600;
			letter-spacing: -0.005em;
		}

		.solid:active {
			transform: scale(0.98);
		}

		.primary {
			background: var(--text);
			color: var(--bg);
		}

		.primary:hover {
			background: #fff;
		}

		.secondary {
			background: rgb(255 255 255 / 0.14);
			color: var(--text);
			backdrop-filter: blur(16px);
		}

		.secondary:hover {
			background: rgb(255 255 255 / 0.22);
		}
	}
</style>
