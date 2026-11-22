import { describe, expect, test } from "bun:test";

import { Device, presentAddress } from "./device";

describe("Device.name", () => {
	test("names the browser and the system", () => {
		expect(
			new Device(
				"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15",
			).name,
		).toBe("Safari on macOS");
		expect(
			new Device(
				"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Edg/126.0.0.0",
			).name,
		).toBe("Edge on Windows");
		expect(
			new Device(
				"Mozilla/5.0 (iPad; CPU OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1",
			).name,
		).toBe("Safari on iPad");
		expect(
			new Device(
				"Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.0.0 Mobile/15E148 Safari/604.1",
			).name,
		).toBe("Chrome on iPhone");
		expect(
			new Device("Mozilla/5.0 (X11; Linux x86_64; rv:127.0) Gecko/20100101 Firefox/127.0").name,
		).toBe("Firefox on Linux");
	});

	test("names a TV by its system", () => {
		expect(new Device("Mozilla/5.0 (SMART-TV; Linux; Tizen 7.0) AppleWebKit/537.36").name).toBe(
			"TV",
		);
	});

	test("does not know a server's HTTP client", () => {
		expect(new Device("Bun/1.4.4").name).toBe("Unknown device");
		expect(new Device(null).name).toBe("Unknown device");
	});
});

describe("presentAddress", () => {
	test("shortens an IPv6 address written out in full", () => {
		expect(presentAddress("2a01:04f8:0010:0000:0000:0000:0000:0002")).toBe("2a01:4f8:10::2");
	});

	test("keeps an IPv4 address", () => {
		expect(presentAddress("203.0.113.7")).toBe("203.0.113.7");
	});

	test("says nothing for an address that tells nothing", () => {
		expect(presentAddress("0000:0000:0000:0000:0000:0000:0000:0000")).toBeNull();
		expect(presentAddress("unknown")).toBeNull();
		expect(presentAddress(null)).toBeNull();
	});
});

describe("Device.kind", () => {
	test("tells a phone, a tablet, a computer and a TV apart", () => {
		expect(
			new Device("Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) Safari/604.1").kind,
		).toBe("phone");
		expect(new Device("Mozilla/5.0 (iPad; CPU OS 17_4 like Mac OS X) Safari/604.1").kind).toBe(
			"tablet",
		);
		expect(new Device("Mozilla/5.0 (Linux; Android 14; Pixel 8) Mobile Safari/537.36").kind).toBe(
			"phone",
		);
		expect(new Device("Mozilla/5.0 (Linux; Android 14; SM-X900) Safari/537.36").kind).toBe(
			"tablet",
		);
		expect(
			new Device("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Version/17.4 Safari/605.1").kind,
		).toBe("computer");
		expect(new Device("Mozilla/5.0 (SMART-TV; Linux; Tizen 7.0)").kind).toBe("tv");
	});

	test("does not know what a server's HTTP client is", () => {
		expect(new Device("Bun/1.4.4").kind).toBe("unknown");
		expect(new Device(null).kind).toBe("unknown");
	});
});

describe("Device.details", () => {
	test("reads the versions a User-Agent tells truthfully", () => {
		expect(
			new Device(
				"Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:131.0) Gecko/20100101 Firefox/131.0",
			).details,
		).toEqual({
			browser: "Firefox",
			browser_version: "131",
			system: "macOS",
			system_version: null,
		});
		expect(
			new Device(
				"Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 Version/17.4 Mobile/15E148 Safari/604.1",
			).details,
		).toEqual({
			browser: "Safari",
			browser_version: "17.4",
			system: "iPhone",
			system_version: "17.4",
		});
	});

	test("says nothing for an unknown client", () => {
		expect(new Device(null).details).toEqual({
			browser: null,
			browser_version: null,
			system: null,
			system_version: null,
		});
	});
});
