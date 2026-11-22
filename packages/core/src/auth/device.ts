import { attempt } from "@sora/shared";

/**
 * An address as people write it: an IPv6 address shortened, as Better Auth
 * stores it written out in full. `null` for one that says nothing about
 * where a sign-in came from, such as the unspecified address `::` or
 * `unknown`.
 */
export const presentAddress = (address: string | null): string | null => {
	const absent = address === null || address === "" || address === "unknown";

	if (absent) {
		return null;
	}

	if (!address.includes(":")) {
		return address;
	}

	const { data: url } = attempt(() => new URL(`http://[${address}]`), TypeError);
	const written = url?.hostname.slice(1, -1) ?? address;

	if (written === "::") {
		return null;
	}

	return written;
};

export type DeviceKind = "computer" | "phone" | "tablet" | "tv" | "unknown";

/** A device, as the `User-Agent` a session was signed in with names it. */
export class Device {
	/** Browsers, most specific first: Edge, Opera and Chrome on iOS all say Chrome or Safari too. */
	static readonly #browsers: readonly (readonly [RegExp, string])[] = [
		[/\bEdg(?:e|A|iOS)?\//u, "Edge"],
		[/\bOPR\/|\bOpera\b/u, "Opera"],
		[/\bFirefox\/|\bFxiOS\//u, "Firefox"],
		[/\bCriOS\/|\bChrome\//u, "Chrome"],
		[/\bVersion\/[\d.]+.*Safari\//u, "Safari"],
	];

	/** Systems, most specific first: an iPad and a Chromebook both look like another system too. */
	static readonly #systems: readonly (readonly [RegExp, string])[] = [
		[/\b(?:Smart-?TV|SMART-TV|Tizen|Web0S|WebOS|AppleTV|Android TV|BRAVIA)\b/u, "TV"],
		[/\biPad\b/u, "iPad"],
		[/\biPhone\b|\biPod\b/u, "iPhone"],
		[/\bAndroid\b/u, "Android"],
		[/\bCrOS\b/u, "ChromeOS"],
		[/\bWindows\b/u, "Windows"],
		[/\bMac OS X\b|\bMacintosh\b/u, "macOS"],
		[/\bLinux\b/u, "Linux"],
	];

	/** Where each browser writes its version, as a major version. */
	static readonly #browserVersions = new Map<string, RegExp>(
		Object.entries({
			Chrome: /\b(?:CriOS|Chrome)\/(?<version>\d+)/u,
			Edge: /\bEdg(?:e|A|iOS)?\/(?<version>\d+)/u,
			Firefox: /\b(?:Firefox|FxiOS)\/(?<version>\d+)/u,
			Opera: /\bOPR\/(?<version>\d+)/u,
			Safari: /\bVersion\/(?<version>\d+(?:\.\d+)?)/u,
		}),
	);

	/** Systems whose `User-Agent` tells the real version. macOS and Windows freeze theirs, so they are left out. */
	static readonly #systemVersions = new Map<string, RegExp>(
		Object.entries({
			Android: /\bAndroid (?<version>\d+(?:\.\d+)?)/u,
			iPad: /\bCPU OS (?<version>\d+(?:_\d+)?)/u,
			iPhone: /\bCPU iPhone OS (?<version>\d+(?:_\d+)?)/u,
		}),
	);

	readonly #text: string;

	constructor(userAgent: string | null) {
		let text = "";

		if (userAgent !== null) {
			text = userAgent;
		}

		this.#text = text;
	}

	/**
	 * The device as people name it, such as `Safari on iPad`. A browser or a
	 * system alone is named alone; one that says neither, such as a server's
	 * HTTP client, is an `Unknown device`.
	 */
	get name(): string {
		const browser = this.#browser;
		const system = this.#system;

		if (browser && system) {
			return `${browser} on ${system}`;
		}

		if (browser) {
			return browser;
		}

		if (system) {
			return system;
		}

		return "Unknown device";
	}

	/** The browser and system it names, each with a version when it can be trusted. */
	get details() {
		const browser = this.#browser ?? null;
		const system = this.#system ?? null;
		let browserVersion: string | undefined;
		let systemVersion: string | undefined;
		let shownSystem = system;

		if (browser) {
			browserVersion = Device.#browserVersions.get(browser)?.exec(this.#text)?.groups?.version;
		}

		if (system) {
			systemVersion = Device.#systemVersions.get(system)?.exec(this.#text)?.groups?.version;
		}

		if (system === "TV") {
			shownSystem = null;
		}

		return {
			browser,
			browser_version: browserVersion ?? null,
			system: shownSystem,
			system_version: systemVersion?.replace("_", ".") ?? null,
		};
	}

	/**
	 * What sort of device it is, for the icon beside it. An Android that does
	 * not say `Mobile` is a tablet.
	 */
	get kind(): DeviceKind {
		const system = this.#system;

		if (system === "TV") {
			return "tv";
		}

		if (system === "iPad") {
			return "tablet";
		}

		if (system === "iPhone") {
			return "phone";
		}

		if (system === "Android") {
			if (/\bMobile\b/u.test(this.#text)) {
				return "phone";
			}

			return "tablet";
		}

		if (system) {
			return "computer";
		}

		return "unknown";
	}

	get #browser(): string | undefined {
		return Device.#browsers.find(([pattern]) => pattern.test(this.#text))?.[1];
	}

	get #system(): string | undefined {
		return Device.#systems.find(([pattern]) => pattern.test(this.#text))?.[1];
	}
}
