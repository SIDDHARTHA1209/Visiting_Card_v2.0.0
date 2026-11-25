/*
  PWA install button.
  - Shows a floating "Install App" button in the browser (when the browser says the app can be installed).
  - Hidden once the app is installed or when it is already running as an installed app.
  - iPhone / iPad Safari cannot show an install prompt, so the button explains Share > Add to Home Screen.
  - Also registers the service worker (sw.js) from any page.
*/
(function () {
	"use strict";

	var script = document.currentScript;
	var ROOT = new URL("./", script ? script.src : location.href);

	/* ---------- service worker ---------- */
	if ("serviceWorker" in navigator) {
		window.addEventListener("load", function () {
			navigator.serviceWorker
				.register(new URL("sw.js", ROOT).href, { scope: ROOT.pathname })
				.catch(function (error) {
					console.warn("Service Worker registration failed:", error);
				});
		});
	}

	/* ---------- anonymous usage counters (installs / opens) ---------- */
	function sendUsage(type) {
		try {
			if (!window.DVC || !DVC.API_URL || !DVC.getAppId) return;

			var standalone =
				window.matchMedia("(display-mode: standalone)").matches ||
				window.navigator.standalone === true;

			fetch(DVC.API_URL, {
				method: "POST",
				headers: { "Content-Type": "text/plain;charset=utf-8" },
				body: JSON.stringify({
					action: "track",
					type: type,
					visitorId: DVC.getAppId(),
					mode: standalone ? "standalone" : "browser"
				}),
				keepalive: true
			}).catch(function () {});
		} catch (e) {}
	}

	/* one "open" per device per 30 minutes, so refreshes and page changes are not counted */
	(function countOpen() {
		try {
			var last = Number(localStorage.getItem("dvc:lastOpenPing") || 0);

			if (Date.now() - last < 30 * 60 * 1000) return;

			localStorage.setItem("dvc:lastOpenPing", String(Date.now()));
			sendUsage("open");
		} catch (e) {}
	})();

	/* ---------- already installed? ---------- */
	function isInstalled() {
		try {
			return (
				window.matchMedia("(display-mode: standalone)").matches ||
				window.matchMedia("(display-mode: fullscreen)").matches ||
				window.matchMedia("(display-mode: minimal-ui)").matches ||
				window.navigator.standalone === true ||
				localStorage.getItem("dvc:pwaInstalled") === "1"
			);
		} catch (e) {
			return false;
		}
	}

	var isIos = /iphone|ipad|ipod/i.test(navigator.userAgent) ||
		(navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

	var deferredPrompt = null;

	/* ---------- button ---------- */
	var installBtn = document.createElement("button");

	installBtn.type = "button";
	installBtn.id = "installApp";
	installBtn.textContent = "Install App";
	installBtn.setAttribute("aria-label", "Install this app");

	Object.assign(installBtn.style, {
		display: "none",
		position: "fixed",
		right: "16px",
		bottom: "calc(16px + env(safe-area-inset-bottom, 0px))",
		padding: "12px 20px",
		backgroundColor: "#0f766e",
		color: "#ffffff",
		border: "none",
		borderRadius: "12px",
		cursor: "pointer",
		zIndex: "99999",
		fontWeight: "800",
		fontSize: "15px",
		fontFamily: "inherit",
		boxShadow: "0 6px 18px rgba(0,0,0,0.35)"
	});

	function show() {
		if (!isInstalled()) installBtn.style.display = "block";
	}

	function hide() {
		installBtn.style.display = "none";
	}

	function iosHelp() {
		var box = document.createElement("div");

		box.style.cssText =
			"position:fixed;inset:0;z-index:100000;background:rgba(0,0,0,.6);display:flex;align-items:flex-end;justify-content:center;padding:16px";

		box.innerHTML =
			'<div style="width:min(420px,100%);background:#f4f1e8;color:#111318;border-radius:16px;padding:18px;font-family:inherit;line-height:1.5">' +
			'<strong style="font-size:17px">Install this app</strong>' +
			'<p style="margin:8px 0 14px">Tap the <b>Share</b> button in Safari, then choose <b>Add to Home Screen</b>.</p>' +
			'<button type="button" style="width:100%;padding:12px;border:0;border-radius:10px;background:#0f766e;color:#fff;font-weight:800;font-size:15px">Got it</button>' +
			"</div>";

		box.addEventListener("click", function (e) {
			if (e.target === box || e.target.tagName === "BUTTON") box.remove();
		});

		document.body.appendChild(box);
	}

	function mount() {
		if (!document.body) return;

		document.body.appendChild(installBtn);

		/* iOS never fires beforeinstallprompt: show the button with instructions */
		if (isIos && !isInstalled()) show();
	}

	if (document.readyState === "loading") {
		document.addEventListener("DOMContentLoaded", mount);
	} else {
		mount();
	}

	/* ---------- browser says the app can be installed ---------- */
	window.addEventListener("beforeinstallprompt", function (e) {
		e.preventDefault();
		deferredPrompt = e;
		show();
	});

	installBtn.addEventListener("click", async function () {
		if (!deferredPrompt) {
			if (isIos) iosHelp();
			return;
		}

		deferredPrompt.prompt();

		var choice = await deferredPrompt.userChoice;

		console.log("Install prompt choice:", choice && choice.outcome);

		deferredPrompt = null;
		hide();
	});

	/* ---------- installed: hide for good ---------- */
	window.addEventListener("appinstalled", function () {
		try { localStorage.setItem("dvc:pwaInstalled", "1"); } catch (e) {}
		sendUsage("install");
		deferredPrompt = null;
		hide();
	});

	/* opened as an installed app: make sure it stays hidden */
	if (isInstalled()) hide();

	try {
		window.matchMedia("(display-mode: standalone)").addEventListener("change", function (e) {
			if (e.matches) hide();
		});
	} catch (e) {}
})();
