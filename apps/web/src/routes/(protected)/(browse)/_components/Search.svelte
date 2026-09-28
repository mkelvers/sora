<script lang="ts">
	import { afterNavigate, goto } from "$app/navigation";
	import { page } from "$app/state";
	import Skeleton from "$lib/components/snippets/Skeleton.svelte";
	import Button from "$lib/components/ui/Button.svelte";
	import { cn } from "$lib/utils";
	import { MagnifyingGlassIcon } from "phosphor-svelte";
	import { tick, untrack } from "svelte";

	import Suggestions from "./Suggestions.svelte";

	const searchRoute = "/(protected)/(browse)/search";

	const onSearch = $derived(page.route.id === searchRoute);

	let form = $state<HTMLFormElement>();
	let input = $state<HTMLInputElement>();
	let panel = $state<HTMLDivElement>();

	let open = $state(page.route.id === searchRoute);
	let text = $state(page.route.id === searchRoute ? (page.url.searchParams.get("q") ?? "") : "");
	let term = $state("");
	let focused = $state(false);
	let dismissed = $state(false);
	let active = $state(-1);
	let retry: (() => void) | undefined;

	const shown = $derived(open && focused && !dismissed && !onSearch && !!term && !!text.trim());

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

		if (event.key === "Enter" && shown && active >= 0 && options?.[active]) {
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
	class="relative flex h-full"
	role="search"
	action="/search"
	onsubmit={submit}
	onfocusin={() => (focused = true)}
	onfocusout={leave}
>
	<div
		class={cn(
			"flex w-0 items-center overflow-hidden bg-header-hover transition-[width] duration-260 ease-[cubic-bezier(0.2,0.8,0.2,1)] motion-reduce:transition-none",
			open && "w-[min(22.5rem,calc(100vw-9rem))]",
		)}
		inert={!open}
	>
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
			aria-activedescendant={shown && active >= 0 ? `search-option-${active}` : undefined}
			oninput={() => {
				dismissed = false;
				active = -1;
			}}
			onkeydown={navigate}
			class="h-full min-w-0 flex-1 bg-transparent pr-3 pl-5 text-sm text-foreground outline-none placeholder:text-subtle"
		/>
	</div>

	<Button
		class={cn(
			"h-full w-12 text-muted hover:bg-header-hover hover:text-foreground focus-visible:ring-inset sm:w-14",
			open && "bg-header-hover text-foreground",
		)}
		aria-label="Search"
		aria-expanded={open}
		onclick={toggle}
	>
		<MagnifyingGlassIcon size="1.5rem" />
	</Button>

	{#if shown}
		<div
			bind:this={panel}
			id="search-suggestions"
			class="absolute top-full right-0 w-full overflow-hidden bg-header-hover pt-1.5 shadow-[0_12px_32px_rgb(0_0_0/0.5)] transition-[opacity,translate] duration-140 outline-none starting:-translate-y-1 starting:opacity-0"
			role="listbox"
			aria-label="Suggestions"
			tabindex="-1"
			onpointerdown={(event) => event.preventDefault()}
		>
			<svelte:boundary onerror={(_, reset) => (retry = reset)}>
				<Suggestions {term} {text} {active} typing={text.trim() !== term} />

				{#snippet pending()}
					{#each { length: 4 }, index (index)}
						<div class="flex items-center gap-3.5 px-4 py-2">
							<Skeleton class="aspect-2/3 w-10" />
							<div class="grid flex-1 gap-2">
								<Skeleton class="h-3.5 w-[70%]" />
								<Skeleton class="h-3 w-[30%]" />
							</div>
						</div>
					{/each}
				{/snippet}

				{#snippet failed()}
					<p class="px-4 py-5 text-sm text-muted">Search isn’t available right now.</p>
				{/snippet}
			</svelte:boundary>
		</div>
	{/if}
</form>
