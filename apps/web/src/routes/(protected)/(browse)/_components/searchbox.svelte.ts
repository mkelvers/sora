import { afterNavigate, goto } from "$app/navigation";
import { page } from "$app/state";
import { tick } from "svelte";
import { MediaQuery } from "svelte/reactivity";

export class Search {
	form = $state<HTMLFormElement>();
	input = $state<HTMLInputElement>();
	panel = $state<HTMLDivElement>();

	open = $state(false);
	text = $state("");
	term = $state("");
	focused = $state(false);
	dismissed = $state(false);
	active = $state(-1);
	retry: (() => void) | undefined;

	private timer: ReturnType<typeof setTimeout> | undefined;
	private mobile = new MediaQuery("max-width: 39.99rem", false);

	onSearch = $derived(page.url.pathname === "/search");
	query = $derived(page.url.searchParams.get("q") ?? "");
	expanded = $derived(this.open || this.mobile.current);
	typing = $derived(this.text.trim() !== this.term);
	shown = $derived(
		this.expanded &&
			this.focused &&
			!this.dismissed &&
			!this.onSearch &&
			!!this.term &&
			!!this.text.trim(),
	);
	activeId = $derived(this.shown && this.active >= 0 ? `search-option-${this.active}` : undefined);

	constructor() {
		this.open = this.onSearch;
		this.text = this.onSearch ? this.query : "";

		afterNavigate(({ to, type }) => {
			this.active = -1;

			if (to?.url.pathname !== "/search") {
				clearTimeout(this.timer);
				this.open = false;
				this.text = "";
				this.term = "";
				this.input?.blur();
				return;
			}

			if (type !== "goto") {
				this.text = this.query;
			}

			this.open = true;

			if (!this.text) {
				tick().then(() => this.input?.focus());
			}
		});
	}

	edit = () => {
		this.dismissed = false;
		this.active = -1;
		clearTimeout(this.timer);
		this.timer = setTimeout(() => {
			this.term = this.text.trim();
			this.retry?.();
			this.retry = undefined;

			if (this.onSearch && this.term && this.term !== this.query) {
				goto(`/search?q=${encodeURIComponent(this.term)}`, {
					replaceState: true,
					keepFocus: true,
					noScroll: true,
				});
			}
		}, 250);
	};

	reveal = async () => {
		this.open = true;
		this.dismissed = false;
		await tick();
		this.input?.focus();
	};

	toggle = () => {
		if (!this.open) {
			this.reveal();
		} else if (this.text.trim()) {
			this.form?.requestSubmit();
		} else if (this.onSearch) {
			this.input?.focus();
		} else {
			this.open = false;
		}
	};

	submit = (event: SubmitEvent) => {
		event.preventDefault();
		const value = this.text.trim();

		if (value) {
			goto(`/search?q=${encodeURIComponent(value)}`);
		}
	};

	keydown = (event: KeyboardEvent) => {
		const options = this.panel?.querySelectorAll<HTMLElement>('[role="option"]');

		if (event.key === "Escape") {
			if (this.shown) {
				this.dismissed = true;
				this.active = -1;
			} else {
				this.input?.blur();
			}
			return;
		}

		if (event.key === "ArrowDown" || event.key === "ArrowUp") {
			if (!this.shown) {
				this.dismissed = false;
				return;
			}

			if (!options?.length) {
				return;
			}

			event.preventDefault();
			const step = event.key === "ArrowDown" ? 1 : -1;
			const count = options.length + 1;
			this.active = ((this.active + 1 + step + count) % count) - 1;
			return;
		}

		if (event.key === "Enter" && this.shown && this.active >= 0 && options?.[this.active]) {
			event.preventDefault();
			options[this.active].click();
		}
	};

	leave = (event: FocusEvent) => {
		if (this.form?.contains(event.relatedTarget as Node | null)) {
			return;
		}

		this.focused = false;
		this.active = -1;

		if (!this.text.trim() && !this.onSearch) {
			this.open = false;
		}
	};

	shortcut = (event: KeyboardEvent) => {
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
		this.reveal();
	};
}
