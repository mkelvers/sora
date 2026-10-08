import { on } from "svelte/events";

/**
 * Centers the mobile crop on visual detail in the upper part of a backdrop,
 * where subjects remain visible above the hero's logo and bottom fade.
 * This estimates composition from contrast; it does not detect faces.
 */
export function mobileBackdrop(image: HTMLImageElement) {
	const mobile = matchMedia("(width < 40rem)");
	let focus = 0.5;
	let analyzedSource: string | undefined;
	let disposed = false;

	async function frame() {
		if (!mobile.matches || !image.naturalWidth || !image.clientHeight) return;

		const source = image.src;
		if (analyzedSource !== source) {
			analyzedSource = source;
			focus = 0.5;
			const canvas = document.createElement("canvas");
			canvas.width = 80;
			canvas.height = 45;
			const context = canvas.getContext("2d", { willReadFrequently: true });
			if (!context) return;

			try {
				// Analyze a small CORS-enabled thumbnail without changing display-image requests.
				const thumbnail = new Image();
				thumbnail.crossOrigin = "anonymous";
				thumbnail.src = source.replace("/original/", "/w300/");
				await thumbnail.decode();
				if (disposed || image.src !== source) return;
				context.drawImage(thumbnail, 0, 0, canvas.width, canvas.height);
				const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
				let contrast = 0;
				let weighted = 0;
				for (let y = 1; y < 30; y++) {
					for (let x = 1; x < canvas.width - 1; x++) {
						const pixel = (y * canvas.width + x) * 4;
						for (let channel = 0; channel < 3; channel++) {
							const detail =
								Math.abs(data[pixel + channel] - data[pixel - 4 + channel]) +
								Math.abs(data[pixel + channel] - data[pixel - canvas.width * 4 + channel]);
							contrast += detail;
							weighted += detail * (x + 0.5);
						}
					}
				}
				if (contrast > 0) focus = weighted / contrast / canvas.width;
			} catch {
				// Unavailable thumbnails or CORS pixel access retain the centered crop.
			}
		}
		if (disposed || !mobile.matches) return;

		const scale = Math.max(
			image.clientWidth / image.naturalWidth,
			image.clientHeight / image.naturalHeight,
		);
		const width = image.naturalWidth * scale;
		const overflow = width - image.clientWidth;
		const position = overflow > 0 ? (focus * width - image.clientWidth / 2) / overflow : 0.5;
		image.style.setProperty(
			"--mobile-backdrop-position",
			`${Math.min(1, Math.max(0, position)) * 100}%`,
		);
	}

	const offLoad = on(image, "load", frame);
	const offMobile = on(mobile, "change", frame);
	const observer = new ResizeObserver(frame);
	observer.observe(image);
	frame();

	return () => {
		disposed = true;
		offLoad();
		offMobile();
		observer.disconnect();
		image.style.removeProperty("--mobile-backdrop-position");
	};
}
