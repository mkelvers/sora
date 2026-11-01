<script lang="ts">
	let {
		size = "1em",
		filled = false,
		class: className,
	}: {
		size?: string;
		filled?: boolean;
		class?: string;
	} = $props();
</script>

<svg
	viewBox="0 0 24 24"
	width={size}
	height={size}
	fill={filled ? "currentColor" : "none"}
	stroke="currentColor"
	stroke-width="1.5"
	stroke-linejoin="miter"
	stroke-miterlimit="10"
	class={className}
	aria-hidden="true"
>
	<polygon
		points="12.00,2.90 14.47,9.50 21.51,9.81 15.99,14.20 17.88,20.99 12.00,17.10 6.12,20.99 8.01,14.20 2.49,9.81 9.53,9.50"
	/>
</svg>
