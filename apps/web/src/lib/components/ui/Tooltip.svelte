<script lang="ts" module>
	import { cva, type VariantProps } from 'class-variance-authority';

	const tooltip = cva('tooltip', {
		variants: {
			placement: {
				top: 'top',
				bottom: 'bottom',
			},
		},
		defaultVariants: {
			placement: 'top',
		},
	});
</script>

<script lang="ts">
	import type { Snippet } from 'svelte';

	type Props = VariantProps<typeof tooltip> & {
		text: string;
		children: Snippet;
		class?: string;
		escapeOverflow?: boolean;
	};

	let {
		text,
		children,
		class: className,
		placement,
		escapeOverflow = false,
	}: Props = $props();

	let trigger = $state<HTMLSpanElement>();
	let position = $state({
		left: 0,
		bottom: 0,
	});
	let visible = $state(false);

	function place() {
		if (!trigger) {
			return;
		}

		const bounds = trigger.getBoundingClientRect();
		position = {
			left: bounds.left + bounds.width / 2,
			bottom: window.innerHeight - bounds.top + 8,
		};
	}

	function show() {
		visible = true;
		if (escapeOverflow) {
			place();
		}
	}

	$effect(() => {
		if (!escapeOverflow) {
			return;
		}

		const update = () => {
			if (visible) {
				place();
			}
		};
		window.addEventListener('scroll', update, true);
		window.addEventListener('resize', update);

		return () => {
			window.removeEventListener('scroll', update, true);
			window.removeEventListener('resize', update);
		};
	});
</script>

<span
	bind:this={trigger}
	role="group"
	class={[tooltip({ placement }), className]}
	onpointerenter={show}
	onpointerleave={() => (visible = false)}
	onfocusin={show}
	onfocusout={() => (visible = false)}
>
	{@render children()}
	<span
		class={['positioner', escapeOverflow && 'escape']}
		style:left={escapeOverflow ? `${position.left}px` : undefined}
		style:bottom={escapeOverflow ? `${position.bottom}px` : undefined}
	>
		<span class="bubble" role="tooltip">{text}</span>
	</span>
</span>

<style>
	@layer tooltip {
		.tooltip {
			position: relative;
			display: inline-flex;
		}

		.positioner {
			position: absolute;
			inset-inline: 0;
			z-index: 50;
			display: flex;
			justify-content: center;
			visibility: hidden;
			opacity: 0;
			pointer-events: none;
			transition: opacity 100ms;
		}

		.top .positioner:not(.escape) {
			bottom: 100%;
			margin-bottom: 8px;
		}

		.bottom .positioner:not(.escape) {
			top: 100%;
			margin-top: 8px;
		}

		.escape {
			position: fixed;
			inset-inline: auto;
			width: max-content;
			translate: -50% 0;
		}

		.tooltip:hover .positioner,
		.tooltip:has(:focus-visible) .positioner {
			visibility: visible;
			opacity: 1;
		}

		.bubble {
			position: relative;
			display: inline-flex;
			align-items: center;
			width: max-content;
			min-height: 44px;
			padding: 0 12px;
			background: var(--tooltip);
			color: var(--tooltip-foreground);
			font-size: 13px;
			font-weight: 400;
			line-height: 1;
			white-space: nowrap;
		}

		.bubble::after {
			content: '';
			position: absolute;
			inset-inline: 0;
			width: 0;
			margin-inline: auto;
			border: 7px solid transparent;
		}

		.top .bubble::after {
			top: 100%;
			border-top-color: var(--tooltip);
		}

		.bottom .bubble::after {
			bottom: 100%;
			border-bottom-color: var(--tooltip);
		}
	}
</style>
