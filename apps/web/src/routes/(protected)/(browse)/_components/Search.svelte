<script lang="ts">
	import { tick, untrack } from "svelte";
	import { afterNavigate, goto } from "$app/navigation";
	import { page } from "$app/state";
	import Skeleton from "$lib/components/snippets/Skeleton.svelte";
	import Button from "$lib/components/ui/Button.svelte";
	import Icon from "$lib/components/ui/Icon.svelte";
	import Suggestions from "./Suggestions.svelte";

	const searchRoute = "/(protected)/(browse)/search";

	const onSearch = $derived(page.route.id === searchRoute);

	let form = $state<HTMLFormElement>();
	let input = $state<HTMLInputElement>();
	let panel = $state<HTMLDivElement>();

	let open = $state(page.route.id === searchRoute);
	let text = $state(
		page.route.id === searchRoute
			? (page.url.searchParams.get("q") ?? "")
			: "",
	);
	let term = $state("");
	let focused = $state(false);
	let dismissed = $state(false);
	let active = $state(-1);
	let retry: (() => void) | undefined;

	const shown = $derived(
		open && focused && !dismissed && !onSearch && !!term && !!text.trim(),
	);

	$effect(() => {
		const value = text.trim();
		const timer = setTimeout(() => {
			if (!onSearch) {
				term = value;
			} else if (value && value !== page.url.searchParams.get("q")) {
				goto(`/search?q=${encodeURIComponent(value)}`, {
					replaceState: true,
					keepFocus: true,
					noScroll: true,
				});
			}
		}, 250);

		return () => clearTimeout(timer);
	});

	$effect(() => {
		void term;
		untrack(() => {
			retry?.();
			retry = undefined;
		});
	});

	afterNavigate(({ to, type }) => {
		active = -1;

		if (to?.route.id !== searchRoute) {
			open = false;
			text = "";
			term = "";
			input?.blur();
			return;
		}

		if (type !== "goto") {
			text = to.url.searchParams.get("q") ?? "";
		}

		open = true;

		if (!text) {
			tick().then(() => input?.focus());
		}
	});

	async function reveal() {
		open = true;
		dismissed = false;
		await tick();
		input?.focus();
	}

	function toggle() {
		if (!open) {
			reveal();
		} else if (text.trim()) {
			form?.requestSubmit();
		} else if (onSearch) {
			input?.focus();
		} else {
			open = false;
		}
	}

	function submit(event: SubmitEvent) {
		event.preventDefault();
		const value = text.trim();

		if (value) {
			goto(`/search?q=${encodeURIComponent(value)}`);
		}
	}

	function navigate(event: KeyboardEvent) {
		const options = panel?.querySelectorAll<HTMLElement>('[role="option"]');

		if (event.key === "Escape") {
			if (shown) {
				dismissed = true;
				active = -1;
			} else {
				input?.blur();
			}
			return;
		}

		if (event.key === "ArrowDown" || event.key === "ArrowUp") {
			if (!shown) {
				dismissed = false;
				return;
			}

			if (!options?.length) {
				return;
			}

			event.preventDefault();
			const step = event.key === "ArrowDown" ? 1 : -1;
			const count = options.length + 1;
			active = ((active + 1 + step + count) % count) - 1;
			return;
		}

		if (
			event.key === "Enter" &&
			shown &&
			active >= 0 &&
			options?.[active]
		) {
			event.preventDefault();
			options[active].click();
		}
	}

	function leave(event: FocusEvent) {
		if (form?.contains(event.relatedTarget as Node | null)) {
			return;
		}

		focused = false;
		active = -1;

		if (!text.trim() && !onSearch) {
			open = false;
		}
	}

	function shortcut(event: KeyboardEvent) {
		const target = event.target as HTMLElement;

		if (
			event.key !== "/" ||
			event.metaKey ||
			event.ctrlKey ||
			event.altKey ||
			target.isContentEditable ||
			["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)
		) {
			return;
		}

		event.preventDefault();
		reveal();
	}
</script>

<svelte:window onkeydown={shortcut} />

<form
	bind:this={form}
	class={["search", open && "open"]}
	role="search"
	action="/search"
	onsubmit={submit}
	onfocusin={() => (focused = true)}
	onfocusout={leave}
>
	<div class="field" inert={!open}>
		<input
			bind:this={input}
			bind:value={text}
			name="q"
			type="text"
			placeholder="Search titles"
			autocomplete="off"
			spellcheck="false"
			role="combobox"
			aria-label="Search titles"
			aria-autocomplete="list"
			aria-controls="search-suggestions"
			aria-expanded={shown}
			aria-activedescendant={shown && active >= 0
				? `search-option-${active}`
				: undefined}
			oninput={() => {
				dismissed = false;
				active = -1;
			}}
			onkeydown={navigate}
		/>
	</div>

	<Button
		class="toggle"
		aria-label="Search"
		title="Search (/)"
		aria-expanded={open}
		onclick={toggle}
	>
		<Icon name="search" />
	</Button>

	{#if shown}
		<div
			bind:this={panel}
			id="search-suggestions"
			class="panel"
			role="listbox"
			aria-label="Suggestions"
			tabindex="-1"
			onpointerdown={(event) => event.preventDefault()}
		>
			<svelte:boundary onerror={(_, reset) => (retry = reset)}>
				<Suggestions
					{term}
					{text}
					{active}
					typing={text.trim() !== term}
				/>

				{#snippet pending()}
					{#each { length: 4 }, index (index)}
						<div class="placeholder">
							<Skeleton width="40px" ratio="2 / 3" />
							<div class="lines">
								<Skeleton variant="text" width="70%" />
								<Skeleton variant="text" width="30%" />
							</div>
						</div>
					{/each}
				{/snippet}

				{#snippet failed()}
					<p class="failed">Search isn’t available right now.</p>
				{/snippet}
			</svelte:boundary>
		</div>
	{/if}
</form>

<style>
	.search {
		position: relative;
		display: flex;
		height: 100%;
	}

	.field {
		display: flex;
		align-items: center;
		width: 0;
		overflow: hidden;
		background: #151515;
		transition: width 260ms cubic-bezier(0.2, 0.8, 0.2, 1);
	}

	.open .field {
		width: 360px;
	}

	input {
		flex: 1;
		min-width: 0;
		height: 100%;
		padding: 0 12px 0 20px;
		border: none;
		background: none;
		color: #fff;
		font: inherit;
		font-size: 15px;
		outline: none;
	}

	input::placeholder {
		color: #666;
	}

	.search :global(.toggle) {
		width: 56px;
		height: 100%;
		color: #999;
	}

	.search :global(.toggle:hover),
	.open :global(.toggle) {
		background: #151515;
		color: #fff;
	}

	.search :global(.toggle:focus-visible) {
		outline-offset: -2px;
	}

	.panel {
		position: absolute;
		top: 100%;
		right: 0;
		width: 100%;
		padding-top: 6px;
		overflow: hidden;
		background: #151515;
		box-shadow: 0 12px 32px rgb(0 0 0 / 0.5);
		outline: none;
		transition:
			opacity 140ms,
			translate 140ms;

		@starting-style {
			opacity: 0;
			translate: 0 -4px;
		}
	}

	.placeholder {
		display: flex;
		align-items: center;
		gap: 14px;
		padding: 8px 16px;
	}

	.lines {
		display: grid;
		flex: 1;
		gap: 8px;
	}

	.failed {
		margin: 0;
		padding: 20px 16px;
		color: #888;
		font-size: 14px;
	}
</style>
