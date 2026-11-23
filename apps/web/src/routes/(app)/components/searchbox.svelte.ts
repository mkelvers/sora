import { afterNavigate, goto } from "$app/navigation";
import { navigating, page } from "$app/state";
import { attempt } from "@sora/shared";
import { tick } from "svelte";

import { editedSearchHref } from "./search-edit";

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
	private timer: ReturnType<typeof setTimeout> | undefined;

	onSearch = $derived(page.url.pathname === "/search");
	query = $derived(page.url.searchParams.get("q") ?? "");
	typing = $derived(this.text.trim() !== this.term);
	shown = $derived(
		this.focused && !this.dismissed && !this.onSearch && !!this.term && !!this.text.trim(),
	);
	activeId = $derived.by(() => {
		const highlighted = this.shown && !this.typing && this.active >= 0;

		if (!highlighted) {
			return;
		}

		return `search-option-${this.active}`;
	});

	constructor() {
		this.open = this.onSearch;
		this.text = "";

		if (this.onSearch) {
			this.text = this.query;
		}

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
				clearTimeout(this.timer);
				this.text = this.query;
			}

			this.open = true;

			if (!this.text) {
				attempt(tick().then(() => this.input?.focus()));
			}
		});
	}

	edit = () => {
		this.dismissed = false;
		this.active = -1;
		clearTimeout(this.timer);
		this.timer = setTimeout(() => {
			this.term = this.text.trim();

			const href = editedSearchHref(this.term, page.url, navigating.to?.url);

			if (href) {
				attempt(
					goto(href, {
						replace: true,
						reset: false,
					}),
				);
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
		if (this.open) {
			clearTimeout(this.timer);
			this.open = false;
			this.input?.blur();

			if (!this.onSearch) {
				this.text = "";
				this.term = "";
			}
		} else {
			this.reveal();
		}
	};

	submit = (event: SubmitEvent) => {
		event.preventDefault();
		const value = this.text.trim();

		if (value) {
			clearTimeout(this.timer);
			attempt(goto(`/search?q=${encodeURIComponent(value)}`));
		}
	};

	keydown = (event: KeyboardEvent) => {
		if (event.key === "Escape") {
			if (this.shown) {
				this.dismissed = true;
				this.active = -1;
			} else {
				this.input?.blur();
			}

			return;
		}

		let options: NodeListOf<HTMLElement> | undefined;

		if (this.shown && !this.typing) {
			options = this.panel?.querySelectorAll<HTMLElement>('[role="option"]');
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
			let step = -1;

			if (event.key === "ArrowDown") {
				step = 1;
			}

			const count = options.length + 1;
			this.active = ((this.active + 1 + step + count) % count) - 1;

			return;
		}

		if (event.key === "Enter" && options?.[this.active]) {
			event.preventDefault();
			options[this.active].click();
		}
	};

	leave = (event: FocusEvent) => {
		if (event.relatedTarget instanceof Node && this.form?.contains(event.relatedTarget)) {
			return;
		}

		this.focused = false;
		this.active = -1;

		if (!this.text.trim() && !this.onSearch) {
			this.open = false;
		}
	};

	shortcut = (event: KeyboardEvent) => {
		const { target } = event;
		const modified = event.metaKey || event.ctrlKey || event.altKey;

		const typing =
			target instanceof HTMLElement &&
			(target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));

		const ignored = event.key !== "/" || modified || typing;

		if (ignored) {
			return;
		}

		event.preventDefault();
		this.reveal();
	};
}
